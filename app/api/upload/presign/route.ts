import { NextResponse } from 'next/server';
import { s3Client } from '@/lib/integrations/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ALLOWED_CONTENT_TYPES = new Set([
  'text/csv',
  'application/json',
  'text/plain',
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB cap

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const contentType = body.contentType || 'text/csv';
    const fileSize = body.fileSize ? Number(body.fileSize) : 0;

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        {
          error: `Content-Type '${contentType}' is not permitted. Permitted types: ${Array.from(
            ALLOWED_CONTENT_TYPES
          ).join(', ')}`,
        },
        { status: 400 }
      );
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds the maximum limit of 50MB.' },
        { status: 400 }
      );
    }

    // Generate safe server-controlled key to prevent path traversal or overwrites
    const extension = contentType === 'application/json' ? 'json' : 'csv';
    const safeKey = `uploads/${Date.now()}_${crypto.randomUUID()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME || 'referee-audit-uploads',
      Key: safeKey,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    return NextResponse.json({ url, key: safeKey });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to generate presigned URL', details: msg },
      { status: 500 }
    );
  }
}
