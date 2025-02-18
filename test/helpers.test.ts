import { SQSRecord } from 'aws-lambda';
import { collateObjectDetails, maskSensitiveData } from '../src/helpers';

describe('collateObjectDetails', () => {
  const sqsRecord = {
    body: JSON.stringify({
      Records: [
        {
          s3: {
            bucket: {
              name: 'test-bucket',
            },
            object: {
              key: 'test/key.txt',
            },
          },
        },
      ],
    }),
  } as SQSRecord;

  it('separates bucket name from object key', () => {
    const expectedResult = [['test-bucket'], ['key.txt']];

    const result = collateObjectDetails([], sqsRecord);

    expect(result).toEqual(expectedResult);
  });

  it('adds new bucket names and object keys to existing ones', () => {
    const existingBucketDetails = [['existing-bucket'], ['existing-key.txt']];

    const expectedResult = [
      ['existing-bucket', 'test-bucket'],
      ['existing-key.txt', 'key.txt'],
    ];

    const result = collateObjectDetails(existingBucketDetails, sqsRecord);

    expect(result).toEqual(expectedResult);
  });

  it('removes duplicate buckets', () => {
    const existingBucketDetails = [['test-bucket'], ['existing-key.txt']];

    const expectedResult = [['test-bucket'], ['existing-key.txt', 'key.txt']];

    const result = collateObjectDetails(existingBucketDetails, sqsRecord);

    expect(result).toEqual(expectedResult);
  });
});

describe('maskSensitiveData', () => {
  it('masks multiple different sensitive data', () => {
    const input = 'AA123456 BB1111222 334455CC';

    const expectedResult = '******** ********* ********';

    const result = maskSensitiveData(input);

    expect(result).toEqual(expectedResult);
  });
});
