import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3EventNotifications from 'aws-cdk-lib/aws-s3-notifications';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as macie from 'aws-cdk-lib/aws-macie';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

const lambdaFnProps: Partial<nodejsLambda.NodejsFunctionProps> = {
  bundling: {
    target: 'es2020',
    logLevel: nodejsLambda.LogLevel.INFO,
    minify: true,
    sourceMap: true,
  },
  runtime: lambda.Runtime.NODEJS_22_X,
  timeout: cdk.Duration.seconds(10),
  memorySize: 128,
  logRetention: logs.RetentionDays.ONE_DAY,
  environment: {
    NODE_OPTIONS: '--enable-source-maps',
  },
};

export class MacieStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sensitiveBucket = new s3.Bucket(this, 'SensitiveBucket', {});
    const maskedBucket = new s3.Bucket(this, 'MaskedBucket', {});

    // Hungarian ID custom data identifier in Macie
    const hungarianIdCustomDataIdentifier = new macie.CfnCustomDataIdentifier(
      this,
      'HungarianIDCardNumberIdentifier',
      {
        name: 'HungarianIDCardNumber',
        regex: '\\b\\d{6}[A-Z]{2}\\b',
        description: 'Hungarian ID card number',
      }
    );

    // Hungarian ID custom data identifier in Macie
    const hungarianPassportNumber = new macie.CfnCustomDataIdentifier(
      this,
      'HungarianPassportIdentifier',
      {
        name: 'HungarianPassportNumber',
        regex: '\\b[A-Z]{2}d{7}\\b',
        description: 'Hungarian passport number',
      }
    );

    // create a queue with a DLQ for error processing and avoiding loops
    const eventDestinationQueue = new sqs.Queue(this, 'EventDestinationQueue', {
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'DeadLetterQueue', {
          retentionPeriod: cdk.Duration.days(14),
        }),
        maxReceiveCount: 3,
      },
    });

    // create Macie job
    const createMacieJobFn = new nodejsLambda.NodejsFunction(
      this,
      'CreateMacieJobFn',
      {
        ...lambdaFnProps,
        entry: './src/macie-discovery-job.ts',
        handler: 'handler',
        environment: {
          ...lambdaFnProps.environment,
          HUNGARIAN_ID_CARD_IDENTIFIER: hungarianIdCustomDataIdentifier.attrId,
          HUNGARIAN_PASSPORT_IDENTIFIER: hungarianPassportNumber.attrId,
        },
      }
    );
    sensitiveBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3EventNotifications.SqsDestination(eventDestinationQueue)
    );

    createMacieJobFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'macie2:CreateClassificationJob',
          'macie2:ListClassificationJobs',
        ],
        resources: [
          `arn:aws:macie2:${props?.env?.region}:${props?.env?.account}:classification-job/*`,
        ],
      })
    );

    // add the SQS queue as event source
    createMacieJobFn.addEventSource(
      new lambdaEventSources.SqsEventSource(eventDestinationQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    // create a lambda function that masks sensitive data found by Macie
    const maskSensitiveDataFn = new nodejsLambda.NodejsFunction(
      this,
      'MaskSensitiveDataFn',
      {
        ...lambdaFnProps,
        entry: './src/mask-sensitive-data.ts',
        handler: 'handler',
        environment: {
          ...lambdaFnProps.environment,
          MASKED_BUCKET_NAME: maskedBucket.bucketName,
        },
      }
    );
    maskSensitiveDataFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [sensitiveBucket.bucketArn + '/*'],
      })
    );
    maskSensitiveDataFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [maskedBucket.bucketArn + '/*'],
      })
    );

    // eventbridge rule on macie findings
    new events.Rule(this, 'MacieFindingsRule', {
      eventPattern: {
        source: ['aws.macie'],
        detailType: ['Macie Finding'],
      },
      targets: [new targets.LambdaFunction(maskSensitiveDataFn)],
    });
  }
}
