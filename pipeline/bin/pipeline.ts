#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();
const environments = ['dev', 'prod']
const deployEnvironment = app.node.tryGetContext('env')
if (!deployEnvironment || !environments.includes(deployEnvironment)) throw new Error('Please supply the env context variable: cdk deploy --context env=dev/prod')

let env = app.node.tryGetContext(deployEnvironment);

const infrastructureRepoName = app.node.tryGetContext('infrastructureRepoName');
const repositoryOwner = app.node.tryGetContext('repositoryOwner');

env = {
  ...env,
  infrastructureRepoName,
  repositoryOwner,
  description: `Stack for the ${deployEnvironment} CI pipeline deployed using the CDK. If you need to delete this stack, delete the ${deployEnvironment} CDK infrastructure stack first.`
}

new PipelineStack(
  app,
  `${deployEnvironment}-CI-Pipeline-Stack`,
  env
)