import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { BuildSpec, Cache, LinuxBuildImage, LocalCacheMode, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { CodeBuildAction, GitHubSourceAction, S3DeployAction } from 'aws-cdk-lib/aws-codepipeline-actions';

interface PipelineStackProps extends cdk.StackProps {
  envName: string;
  infrastructureRepoName: string;
  infrastructureBranchName: string;
  repositoryOwner: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    console.log(props);

    const { 
      envName,
      infrastructureRepoName,
      infrastructureBranchName,
      repositoryOwner,
    } = props;

    const gitHubToken = cdk.SecretValue.secretsManager('github-token');


    const infrastructureDeployRole = new iam.Role(
      this,
      'InfrastructureDeployRole',
      {
        assumedBy: new iam.CompositePrincipal(
          new iam.ServicePrincipal('codebuild.amazonaws.com'),
          new iam.ServicePrincipal('codepipeline.amazonaws.com')
        ),
        inlinePolicies: {
          CdkDeployPermissions: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['sts:AssumeRole'],
                resources: ['arn:aws:iam::*:role/cdk-*'],
              }),
            ],
          })    
        }
      }
    )

    const artifactBucket = new s3.Bucket(
      this,
      'ArtifactBucket',
      {
        bucketName:`kuriaks1-${envName}-codepipeline-artifact-bucket`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      }
    );


    const infrastructureSourceOutput = new Artifact('InfrastructureSourceOutput');

    // Build project for infrastructure (CDK)
    const infrastructureBuildProject = new PipelineProject(
      this,
      'InfrastructureBuildProject',
      {
        role: infrastructureDeployRole,
        environment: {
          buildImage: LinuxBuildImage.AMAZON_LINUX_2_5
        },
        environmentVariables: {
          DEPLOY_ENVIRONMENT: {
            value: envName
          }
        },
        buildSpec: BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': {
                nodejs: '20.x'
              },
              commands: [
                'npm install -g aws-cdk',
                'cd infrastructure',
                'npm install'
              ]
            },
            build: {
              commands: [
                `cdk deploy --context env=${envName}`
              ]
            }
          }
        }),
      }
    );


     // Define the CodePipeline
     const pipeline = new Pipeline(
      this,
      'CIPipeline', 
      {
        pipelineName: `${envName}-CI-Pipeline`,
        role: infrastructureDeployRole,
        artifactBucket
      }
    );

    // Source FE + Infrastructure stage
    pipeline.addStage({
      stageName: 'Source',
      actions: [

        new GitHubSourceAction({
          owner: repositoryOwner,
          repo: infrastructureRepoName,
          actionName: 'InfrastructureSource',
          branch: infrastructureBranchName,
          output: infrastructureSourceOutput,
          oauthToken: gitHubToken
        }),
      ],
    });

            // Deploy frontend to S3 and deploy the CDK infrastructure
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new CodeBuildAction({
          actionName: 'DeployCdkInfrastructure',
          project: infrastructureBuildProject,
          input: infrastructureSourceOutput,
          role: infrastructureDeployRole
        }),
      ],
    });



    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'PipelineQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
