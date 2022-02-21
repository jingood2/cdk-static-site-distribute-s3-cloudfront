import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Stack } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { identifyResource } from './config-util';

export interface IStaticSiteStackProps extends cdk.StackProps {
  readonly resourcePrefix: string;
  readonly hostedZoneId: string;
  readonly hostedZoneName: string;
  readonly domainName: string;
  readonly includeWWW: boolean;
  //readonly siteSourcePath: string;
}

export class StaticSiteStack extends Construct {
  constructor(scope: Construct, id: string, props: IStaticSiteStackProps) {
    super(scope, id );

    //const zone = route53.HostedZone.fromLookup(this,
    //  identifyResource(resourcePrefix.valueAsString, 'hosted-zone'), { domainName: hostedZoneName.valueAsString });
    const zone = route53.HostedZone.fromHostedZoneAttributes(this,
      identifyResource(props.resourcePrefix, 'hosted-zone'),
      { hostedZoneId: props.hostedZoneId, zoneName: props.hostedZoneName });

    const siteDomain = props.domainName;
    const fullSiteDomain = `www.${siteDomain}`;
    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, identifyResource(props.resourcePrefix, 'cloudfront-OAI'), {
      comment: `OAI for ${id}`,
    });

    // Create an s3 bucket for the static content
    const siteBucket = new s3.Bucket(this, identifyResource(props.resourcePrefix, 'site-bucket'), {
      bucketName: siteDomain,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      // !!! CAUTION: setting this to true will destroy the entire S3 bucket in case of failure / destruction (unless it is not empty)
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code

      // !!! CAUTION: setting this to true will clear the entire S3 bucket in case of failure / destruction
      autoDeleteObjects: true, // NOT recommended for production code
    });

    const staticSiteBucketNameOutputId = `${props.resourcePrefix}-bucket-name`;

    // Grant access to cloudfront
    siteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [siteBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
    }));
    new cdk.CfnOutput(this, staticSiteBucketNameOutputId, { value: siteBucket.bucketName, exportName: staticSiteBucketNameOutputId });

    // Create TLS certificate + automatic DNS validation
    const certificateArn = new acm.DnsValidatedCertificate(this, identifyResource(props.resourcePrefix, 'site-certificate'), {
      domainName: siteDomain,
      hostedZone: zone,
      region: 'us-east-1', // Cloudfront only checks this region for certificates.
      subjectAlternativeNames: props.includeWWW ? [fullSiteDomain] : [],
    }).certificateArn;

    const viewerCertificate = cloudfront.ViewerCertificate.fromAcmCertificate({
      certificateArn: certificateArn,
      env: {
        region: Stack.of(this).region,
        account: Stack.of(this).account,
      },
      node: this.node,
      stack: Stack.of(this),
      metricDaysToExpiry: () =>
        new cloudwatch.Metric({
          namespace: 'TLS Viewer Certificate Validity',
          metricName: 'TLS Viewer Certificate Expired',
        }),
      applyRemovalPolicy: (_policy: cdk.RemovalPolicy) => {},
    },
    {
      sslMethod: cloudfront.SSLMethod.SNI,
      securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      aliases: props.includeWWW? [siteDomain, fullSiteDomain] : [siteDomain],
    });

    // Set up the CloudFront distribution
    const distribution = new cloudfront.CloudFrontWebDistribution(this, identifyResource(props.resourcePrefix, 'site-distribution'), {
      viewerCertificate,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: siteBucket,
            originAccessIdentity: cloudfrontOAI,
          },
          behaviors: [{
            isDefaultBehavior: true,
            compress: true,
            allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
          }],
        },
      ],
    });

    const staticSiteDistributionIdOutputId = `${props.resourcePrefix}-distribution`;

    new cdk.CfnOutput(this, staticSiteDistributionIdOutputId,
      { value: distribution.distributionId, exportName: staticSiteDistributionIdOutputId });

    // Set up Route53 aliases records for the CloudFront distribution
    new route53.ARecord(this, identifyResource(props.resourcePrefix, 'site-alias-record-01'), {
      recordName: siteDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone,
    });

    if (props.includeWWW) {
      new route53.ARecord(this, identifyResource(props.resourcePrefix, 'site-alias-record-02'), {
        recordName: fullSiteDomain,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        zone,
      });
    }

    // Deploy site contents to S3 bucket
    new s3deploy.BucketDeployment(this, identifyResource(props.resourcePrefix, 'bucket-deployment'), {
      sources: [s3deploy.Source.asset(path.join(__dirname, '.', '../dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });
  }
}