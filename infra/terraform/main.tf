terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ---------- ECR (optional, kept for future container builds) ----------

resource "aws_ecr_repository" "referee" {
  name                 = var.ecr_repository_name
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

# ---------- Networking ----------

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Referee ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "tasks" {
  name        = "${var.name}-tasks"
  description = "Referee EC2 host"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---------- Logs ----------

resource "aws_cloudwatch_log_group" "referee" {
  name              = "/ec2/${var.name}"
  retention_in_days = 30
}

# ---------- Secrets ----------

resource "aws_secretsmanager_secret" "referee_api_key" {
  name = "${var.name}/api-key"
}

# ---------- EC2 host ----------

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ---------- IAM for EC2 (S3 read + SSM) ----------
resource "aws_iam_role" "referee_ec2" {
  name = "${var.name}-ec2-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.referee_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "s3_read" {
  name = "${var.name}-s3-read"
  role = aws_iam_role.referee_ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = "arn:aws:s3:::${var.deploy_bucket}/*"
    }]
  })
}

resource "aws_iam_instance_profile" "referee_ec2" {
  name = "${var.name}-ec2-profile"
  role = aws_iam_role.referee_ec2.name
}

resource "aws_instance" "referee" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = "t3.large"
  key_name               = "referee-key"
  iam_instance_profile   = aws_iam_instance_profile.referee_ec2.name
  vpc_security_group_ids = [aws_security_group.tasks.id]

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }
  subnet_id              = data.aws_subnets.default.ids[0]

  user_data = <<-EOF
#!/bin/bash
set -eux
dnf install -y python3.12 python3.12-pip unzip
mkdir -p /opt/referee
cd /opt/referee
aws s3 cp "s3://${var.deploy_bucket}/referee.zip" referee.zip
unzip -o referee.zip
python3.12 -m pip install .
cat >/etc/referee.env <<'ENVEOF'
REFEREE_API_KEY=${var.referee_api_key}
REFEREE_MAX_CSV_MB=25
REFEREE_WORKERS=2
REFEREE_ENV=production
ENVEOF
cat >/etc/systemd/system/referee.service <<'SVCEOF'
[Unit]
Description=Referee core
After=network.target

[Service]
EnvironmentFile=/etc/referee.env
ExecStart=/usr/bin/python3.12 -m uvicorn referee_core.api:app --host 0.0.0.0 --port 8000 --workers 2
WorkingDirectory=/opt/referee
Restart=always

[Install]
WantedBy=multi-user.target
SVCEOF
systemctl daemon-reload
systemctl enable --now referee
EOF

  tags = {
    Name = "${var.name}-host"
  }
}

# ---------- Load balancer ----------

resource "aws_lb" "referee" {
  name               = "${var.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_target_group" "referee_ec2" {
  name        = "${var.name}-ec2-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "instance"

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group_attachment" "referee_ec2" {
  target_group_arn = aws_lb_target_group.referee_ec2.arn
  target_id        = aws_instance.referee.id
  port             = 8000
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.referee.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.acm_certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.referee.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.referee_ec2.arn
  }
}