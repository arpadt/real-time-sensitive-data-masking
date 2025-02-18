import { EventBridgeEvent } from 'aws-lambda';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { maskSensitiveData, streamToString } from './helpers';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

interface MacieDetail {
  resourcesAffected: {
    s3Bucket: {
      name: string;
    };
    s3Object: {
      key: string;
    };
  };
}

const { MASKED_BUCKET_NAME } = process.env;

export const handler = async (
  event: EventBridgeEvent<'Macie Finding', MacieDetail>
): Promise<void> => {
  if (!MASKED_BUCKET_NAME) {
    throw new Error('No target bucket name configured');
  }

  const bucketName = event.detail.resourcesAffected.s3Bucket.name;
  const objectKey = event.detail.resourcesAffected.s3Object.key;

  let getObjectResponse: GetObjectCommandOutput;

  try {
    // Get the object from S3
    getObjectResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      })
    );
  } catch (error) {
    console.error('Error getting object from S3:', error);
    throw error;
  }

  if (!getObjectResponse.Body) {
    throw new Error('No object body received');
  }

  let content: string;

  try {
    // Convert stream to string
    content = await streamToString(getObjectResponse.Body);
    console.log('Converted S3 blob to string');
  } catch (error) {
    console.error('Error while converting S3 blob to string');
    throw error;
  }

  // Apply masking to sensitive data
  const maskedContent = maskSensitiveData(content);
  console.log('Masked sensitive data', JSON.stringify(maskedContent, null, 2));

  try {
    // Upload masked content back a different bucket to avoid loops
    await s3Client.send(
      new PutObjectCommand({
        Bucket: MASKED_BUCKET_NAME,
        Key: objectKey,
        Body: maskedContent,
        ContentType: getObjectResponse.ContentType,
      })
    );

    console.log(`Successfully masked and stored object: masked/${objectKey}`);
  } catch (error) {
    console.error('Error processing object:', error);
    throw error;
  }
};
