// https://medium.com/@claude.ducharme/3-aws-sdk-for-javascript-v3-examples-using-typescript-c1e1ab209ec6

import { S3EventRecord, SQSRecord } from 'aws-lambda';

export function streamToString(
  stream: NodeJS.ReadableStream | ReadableStream | Blob
): Promise<string> {
  const nodejsReadableStream = stream as NodeJS.ReadableStream;
  const readableStream = stream as ReadableStream<Uint8Array>;
  const blob = stream as Blob;

  return new Promise(async (resolve, reject) => {
    if (nodejsReadableStream !== undefined) {
      const chunks = [new Uint8Array()];
      nodejsReadableStream.on('data', (chunk: Uint8Array) =>
        chunks.push(chunk)
      );
      nodejsReadableStream.on('error', reject);
      nodejsReadableStream.on('end', () =>
        resolve(Buffer.concat(chunks).toString('utf8'))
      );
    } else if (readableStream !== undefined) {
      const chunks = [new Uint8Array()];
      const reader: ReadableStreamDefaultReader<Uint8Array> =
        readableStream.getReader();
      while (true) {
        const promiseResult = reader.read();
        const readResult = await promiseResult;
        if (readResult.done) {
          break;
        }

        if (readResult.value) {
          chunks.push(readResult.value);
        }
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    } else if (blob !== undefined) {
      const str = await blob.text();
      resolve(str);
    } else {
      reject('No matching type');
    }
  });
}

export function maskSensitiveData(content: string): string {
  // Mask Hungarian ID card number
  content = content.replace(/\b\d{6}[A-Z]{2}\b/g, '********');

  // Mask Hungarian passport number
  content = content.replace(/\b[A-Z]{2}\d{7}\b/g, '*********');

  // Mask Hungarian drivers licence
  content = content.replace(/\b[A-Z]{2}\d{6}\b/g, '********');

  return content;
}

export function collateObjectDetails(acc: string[][], record: SQSRecord) {
  const body = JSON.parse(record.body) as { Records: S3EventRecord[] };
  const bucket = body.Records[0].s3.bucket.name;
  const keyArr = body.Records[0].s3.object.key.split('/');
  const key = keyArr[keyArr.length - 1];

  const buckets = [...(acc[0] || []), bucket];
  const keys = [...(acc[1] || []), key];

  return [Array.from(new Set(buckets)), Array.from(new Set(keys))];
}

export function getObjectKeys(record: S3EventRecord) {
  const keyArr = record.s3.object.key.split('/');
  const key = keyArr[keyArr.length - 1];

  return key;
}
