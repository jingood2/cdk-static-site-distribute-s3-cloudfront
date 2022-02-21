import { App, CfnParameter, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StaticSiteStack } from './lib/static-site.stack';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // define resources here...
    new CfnParameter(this, 'ResourcePrefix', {
      type: 'String',
      description: 'ResourcePrefix',
      default: 'Ecme',
    });

    new CfnParameter(this, 'Route53 Hosted Zone Name', {
      type: 'String',
      description: 'Route53 Hosted Zone Name',
      default: 'skcnctf.tk',
    });

    new CfnParameter(this, 'Route53 Hosted Zone Id', {
      type: 'String',
      description: 'Route53 Hosted Zone Id',
      default: 'Z10008191COSSLORKT6ZO',
    });

    new CfnParameter(this, 'Host Domain Name', {
      type: 'String',
      description: 'Host Domain Name',
      default: 'hello2.skcnctf.tk',
    });

    new CfnParameter(this, 'includeWWW', {
      type: 'String',
      description: 'include WWW true/false',
      allowedValues: ['true', 'false'],
    });

    new StaticSiteStack(this, 'Spa', {
      env: devEnv,
      resourcePrefix: 'Ecme',
      hostedZoneName: 'skcnctf.tk',
      hostedZoneId: 'Z10008191COSSLORKT6ZO',
      domainName: 'homepage.skcnctf.tk',
      includeWWW: true,
    });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEPLOY_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION,
};

const app = new App();

new MyStack(app, 'main', { env: devEnv });
// new MyStack(app, 'my-stack-prod', { env: prodEnv });
/* new StaticSiteStack(app, 'static-site', {
  env: devEnv,
  resourcePrefix: 'cdk-static-site',
  hostedZoneName: 'skcnctf.tk',
  domainName: 'home.skcnctf.tk',
  includeWWW: true,
}); */
app.synth();