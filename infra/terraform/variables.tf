variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "name" {
  type    = string
  default = "referee"
}

variable "ecr_repository_name" {
  type    = string
  default = "referee-core"
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "task_cpu" {
  type    = string
  default = "1024"
}

variable "task_memory" {
  type    = string
  default = "2048"
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}

variable "allowed_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

variable "deploy_bucket" {
  type    = string
  default = "referee-deploy-006514117590"
}

variable "referee_api_key" {
  type      = string
  sensitive = true
  # No default on purpose: leaving this empty means the service fails closed
  # (503 on every request) rather than serving an unauthenticated engine.
  # Supply it with `TF_VAR_referee_api_key=...` or a tfvars file.
  default = null
}