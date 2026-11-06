import * as cdk from "aws-cdk-lib";
import { HttpServersBenchStack } from "../lib/http-servers-bench-stack.js";

const app = new cdk.App();
new HttpServersBenchStack(app, "WarefeatsHttpServersBench", {
  env: {
    account: process.env["CDK_DEFAULT_ACCOUNT"],
    region: process.env["CDK_DEFAULT_REGION"],
  },
});
