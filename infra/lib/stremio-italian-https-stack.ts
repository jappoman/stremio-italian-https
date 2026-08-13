import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { copyStaticAssetsHooks } from './copy-static-assets';

/** A single Lambda plus public Function URL; video traffic never hits Lambda. */
export class StremioItalianHttpsStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const functionName = 'stremio-italian-https';
    // CDK executes the TypeScript entry point from infra/lib, therefore the
    // repository root is two levels above this source file.
    const repoRoot = path.join(__dirname, '..', '..');
    const logGroup = new logs.LogGroup(this, 'AddonLogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const fn = new lambdaNodejs.NodejsFunction(this, 'AddonFunction', {
      functionName,
      entry: path.join(repoRoot, 'src', 'lambda.js'),
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, 'package-lock.json'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logGroup,
      bundling: {
        minify: false,
        sourceMap: false,
        target: 'node24',
        commandHooks: copyStaticAssetsHooks(),
      },
    });
    const functionUrl = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE, cors: undefined });
    new cdk.CfnOutput(this, 'FunctionUrl', { value: functionUrl.url });
    new cdk.CfnOutput(this, 'FunctionName', { value: fn.functionName });
  }
}
