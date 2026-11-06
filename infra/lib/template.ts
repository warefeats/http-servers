import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { HttpServersBenchStack } from "./http-servers-bench-stack.js";

/** A launch template of the synthesized stack, as the rig's checks read it. */
export interface LaunchTemplateFacts {
  logicalId: string;
  instanceType: string;
  /** The user data script as deployed (CloudFormation base64-encodes it). */
  userData: string;
  data: Record<string, unknown>;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const ACCOUNT = "123456789012";
const REGION = "us-east-1";

/**
 * The default VPC lookup's answer, so synthesis never calls AWS. CDK's own placeholder (vpc-12345) fails its
 * template validation with a warning; a well-formed id doesn't.
 */
const DEFAULT_VPC_CONTEXT = {
  [`vpc-provider:account=${ACCOUNT}:filter.isDefault=true:region=${REGION}:returnAsymmetricSubnets=true`]: {
    vpcId: "vpc-0123456789abcdef0",
    vpcCidrBlock: "172.31.0.0/16",
    ownerAccountId: ACCOUNT,
    availabilityZones: [],
    subnetGroups: [],
  },
};

/** The stack synthesized offline, as the tests and scripts/rig-walk.sh see it: a fixed account and region. */
export function synthesize(): Template {
  const app = new cdk.App({ context: DEFAULT_VPC_CONTEXT });
  const stack = new HttpServersBenchStack(app, "WarefeatsHttpServersBench", {
    env: { account: ACCOUNT, region: REGION },
  });
  return Template.fromStack(stack);
}

/** Every AWS::EC2::LaunchTemplate in a synthesized template, with its plain-text user data. */
export function launchTemplates(template: unknown): LaunchTemplateFacts[] {
  const resources = isRecord(template) ? template["Resources"] : undefined;
  if (!isRecord(resources)) throw new Error("the template has no Resources");
  const out: LaunchTemplateFacts[] = [];
  for (const [logicalId, resource] of Object.entries(resources)) {
    if (!isRecord(resource) || resource["Type"] !== "AWS::EC2::LaunchTemplate") continue;
    const props = resource["Properties"];
    const data = isRecord(props) ? props["LaunchTemplateData"] : undefined;
    if (!isRecord(data)) throw new Error(`${logicalId} has no LaunchTemplateData`);
    const instanceType = data["InstanceType"];
    const encoded = data["UserData"];
    const userData = isRecord(encoded) ? encoded["Fn::Base64"] : undefined;
    if (typeof instanceType !== "string") throw new Error(`${logicalId} has no instance type`);
    if (typeof userData !== "string") throw new Error(`${logicalId}'s user data is not a plain string`);
    out.push({ logicalId, instanceType, userData, data });
  }
  return out;
}
