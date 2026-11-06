import { describe, expect, test } from "bun:test";
import { Match } from "aws-cdk-lib/assertions";
import {
  BUN_VERSION,
  CLIENT_TYPE,
  OHA_SHA256,
  OHA_VERSION,
  READY_MARKER,
  SERVER_TYPE,
  SHUTDOWN_MINUTES,
} from "../lib/http-servers-bench-stack.js";
import { isRecord, launchTemplates, synthesize } from "../lib/template.js";

describe("HttpServersBenchStack", () => {
  const template = synthesize();
  const lts = launchTemplates(template.toJSON());
  const lt = (instanceType: string) => {
    const found = lts.find((t) => t.instanceType === instanceType);
    if (!found) throw new Error(`no launch template for ${instanceType}`);
    return found;
  };
  const lines = (instanceType: string) => lt(instanceType).userData.trimEnd().split("\n");

  test("the results bucket has its fixed name, expires runs and stale uploads, and goes with the stack", () => {
    template.resourceCountIs("AWS::S3::Bucket", 1);
    template.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Delete",
      Properties: {
        BucketName: "warefeats-http-servers-results-123456789012",
        LifecycleConfiguration: {
          Rules: [{ ExpirationInDays: 90, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 }, Status: "Enabled" }],
        },
      },
    });
    // autoDeleteObjects empties it before the delete
    template.resourceCountIs("Custom::S3AutoDeleteObjects", 1);
  });

  test("the bucket refuses plain HTTP", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: "Deny", Condition: { Bool: { "aws:SecureTransport": "false" } } }),
        ]),
      },
    });
  });

  test("one security group, open to itself only", () => {
    template.resourceCountIs("AWS::EC2::SecurityGroup", 1);
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      IpProtocol: "-1",
      SourceSecurityGroupId: { "Fn::GetAtt": [Match.stringLikeRegexp("^BenchSg"), "GroupId"] },
    });
  });

  test("one cluster placement group, which both launch templates use", () => {
    template.resourceCountIs("AWS::EC2::PlacementGroup", 1);
    template.hasResourceProperties("AWS::EC2::PlacementGroup", { Strategy: "cluster" });
    const [groupId] = Object.keys(template.findResources("AWS::EC2::PlacementGroup"));
    for (const t of lts) {
      const placement = t.data["Placement"];
      expect(isRecord(placement) ? placement["GroupName"] : undefined).toEqual({ "Fn::GetAtt": [groupId, "GroupName"] });
    }
  });

  test("the instance role has SSM core and read/write on the bucket", () => {
    template.hasResourceProperties("AWS::IAM::Role", {
      ManagedPolicyArns: [
        { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, ":iam::aws:policy/AmazonSSMManagedInstanceCore"]] },
      ],
    });
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(["s3:GetObject*", "s3:PutObject"]), Effect: "Allow" }),
        ]),
      },
    });
    // one instance profile per launch template
    template.resourceCountIs("AWS::IAM::InstanceProfile", 2);
  });

  test("two launch templates: the server and the client", () => {
    expect(lts.map((t) => t.instanceType).sort()).toEqual([SERVER_TYPE, CLIENT_TYPE].sort());
  });

  const roots: [string, number][] = [
    [SERVER_TYPE, 30],
    [CLIENT_TYPE, 60],
  ];
  test.each(roots)("%s: gp3 root of %d GiB, IMDSv2, terminate on shutdown", (instanceType, gib) => {
    template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
      LaunchTemplateData: {
        InstanceType: instanceType,
        InstanceInitiatedShutdownBehavior: "terminate",
        MetadataOptions: { HttpTokens: "required" },
        BlockDeviceMappings: [
          { DeviceName: "/dev/sda1", Ebs: { VolumeSize: gib, VolumeType: "gp3", DeleteOnTermination: true } },
        ],
        SecurityGroupIds: [{ "Fn::GetAtt": [Match.stringLikeRegexp("^BenchSg"), "GroupId"] }],
        ImageId: { Ref: Match.stringLikeRegexp("ubuntuserver2404stablecurrentarm64") },
      },
    });
  });

  test.each([SERVER_TYPE, CLIENT_TYPE])("%s user data: safety shutdown first, ready marker last, no clone", (instanceType) => {
    const l = lines(instanceType);
    expect(l[0]).toBe("#!/bin/bash");
    expect(l[1]).toBe("set -euxo pipefail");
    expect(l[2]).toBe(`shutdown -h +${SHUTDOWN_MINUTES}`);
    expect(l.at(-1)).toEndWith(`> ${READY_MARKER}`);
    expect(l.filter((x) => x.includes(READY_MARKER))).toHaveLength(1);
    const text = l.join("\n");
    expect(text).toContain("while fuser /var/lib/dpkg/lock-frontend");
    expect(text).toContain("install -y curl git unzip jq iproute2 ethtool build-essential pkg-config");
    expect(text).toContain("awscli-exe-linux-$(uname -m).zip");
    expect(text).toContain(`curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}"`);
    expect(text).not.toContain("git clone");
  });

  test("only the client gets Rust and oha, and the server paces with fq", () => {
    const server = lt(SERVER_TYPE).userData;
    const client = lt(CLIENT_TYPE).userData;
    expect(server).not.toContain("rustup");
    expect(server).not.toContain("oha");
    expect(server).toContain("modprobe sch_fq");
    expect(client).toContain("modprobe sch_netem");
    expect(client).toContain("--profile minimal --default-toolchain stable");
    expect(client).toContain("export RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo");
    expect(client).toContain(`https://github.com/hatoo/oha/releases/download/v${OHA_VERSION}/oha-linux-arm64`);
    expect(client).toContain(`echo "${OHA_SHA256}  /tmp/oha" | sha256sum -c -`);
    expect(client).toContain("install -m 755 /tmp/oha /usr/local/bin/oha");
  });

  test("the outputs the rig workflow reads", () => {
    for (const name of ["ServerLtId", "ClientLtId", "PlacementGroup", "SecurityGroupId", "InstanceRoleArn", "ResultsBucketName"]) {
      template.hasOutput(name, {});
    }
  });
});
