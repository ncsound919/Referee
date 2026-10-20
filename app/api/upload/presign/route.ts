import { NextResponse } from 'next/server';
import { s3Client } from '@/lib/integrations/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';
// Assuming s3-request-presigner might be available or I'll implement a stub
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'; 

export async function POST(req: Request) {
  const { key, contentType } = await req.json();
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate presigned URL' }, { status: 500 });
  }
}
