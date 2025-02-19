#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MacieStack } from '../lib/macie-stack';

const app = new cdk.App();
new MacieStack(app, 'MacieStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

app.synth();
