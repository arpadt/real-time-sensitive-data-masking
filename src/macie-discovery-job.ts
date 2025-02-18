import { SQSEvent } from 'aws-lambda';
import {
  Macie2Client,
  CreateClassificationJobCommand,
  S3JobDefinition,
  ManagedDataIdentifierSelector,
} from '@aws-sdk/client-macie2';

import { driversLicenseDataType } from './constants';
import { collateObjectDetails } from './helpers';

const macieClient = new Macie2Client({ region: process.env.AWS_REGION });

const { HUNGARIAN_ID_CARD_IDENTIFIER, HUNGARIAN_PASSPORT_IDENTIFIER } =
  process.env;

export const handler = async (event: SQSEvent): Promise<string> => {
  if (!HUNGARIAN_ID_CARD_IDENTIFIER || !HUNGARIAN_PASSPORT_IDENTIFIER) {
    throw new Error('Mandatory environment variables are missing');
  }

  console.log('EVENT', JSON.stringify(event, null, 2));

  if (!event.Records || event.Records.length === 0) {
    console.log('No records found in the event');
    return 'No job created';
  }

  const [buckets, keys] = event.Records.reduce(collateObjectDetails, []);

  // // Create unique job name using timestamp and object key
  const jobName = `macie-scan-${Date.now()}`;

  // // Configure the S3 job definition
  const s3JobDefinition: S3JobDefinition = {
    bucketDefinitions: [
      {
        accountId: event.Records[0].eventSourceARN.split(':')[4],
        buckets,
      },
    ],
    scoping: {
      includes: {
        and: [
          {
            simpleScopeTerm: {
              comparator: 'STARTS_WITH',
              key: 'OBJECT_KEY',
              values: keys,
            },
          },
        ],
      },
    },
  };

  // // Create the Macie classification job
  const createJobCommand = new CreateClassificationJobCommand({
    name: jobName,
    jobType: 'ONE_TIME',
    s3JobDefinition,
    initialRun: true,
    customDataIdentifierIds: [
      HUNGARIAN_ID_CARD_IDENTIFIER,
      HUNGARIAN_PASSPORT_IDENTIFIER,
    ],
    managedDataIdentifierSelector: ManagedDataIdentifierSelector.INCLUDE,
    managedDataIdentifierIds: [driversLicenseDataType],
  });

  try {
    const response = await macieClient.send(createJobCommand);

    console.log('Macie job created successfully:', {
      jobId: response.jobId,
      jobName: jobName,
      buckets,
      keys,
    });

    return response.jobId ?? 'No job id provided';
  } catch (error) {
    console.error('Error processing S3 event:', error);
    throw error;
  }
};
