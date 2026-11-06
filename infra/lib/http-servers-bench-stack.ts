import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

/** The rig's two instances (docs/adr/0001, Hardware): a server the size a service runs on, and a network-optimized client. */
export const SERVER_TYPE = "c8g.xlarge";
export const CLIENT_TYPE = "c8gn.4xlarge";

/** User data's last line writes this file, and the rig's readiness gate (scripts/ssm/readiness.sh) waits for it. */
export const READY_MARKER = "/var/lib/bench-ready";

/** The safety net: an instance its job forgot powers off after the job's own 330 minutes, which terminates it. */
export const SHUTDOWN_MINUTES = 330;

export const BUN_VERSION = "1.4.0";
export const OHA_VERSION = "1.16.0";
export const OHA_SHA256 = "99a790eb8c3e0feaca974bd6b32f0f8d4426a0c5b289f39e833e5b2c7529cd39";

const UBUNTU_ARM64 = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id";
const RUST_ENV = "RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo";

export type Role = "server" | "client";

/** apt-get that waits for the dpkg lock instead of failing on it. */
const aptGet = (args: string) => `apt-get -o DPkg::Lock::Timeout=600 ${args}`;

/** A kernel module the slow-client cell needs, from linux-modules-extra when the base modules lack it. */
const kernelModule = (name: string) =>
  `if ! modprobe ${name}; then ${aptGet('install -y "linux-modules-extra-$(uname -r)"')}; modprobe ${name}; fi`;

/**
 * The user data of each role, one shell line per entry. No repository clone: the instances get the dispatched
 * commit as a bundle through the results bucket (scripts/ssm/unpack.sh), so a private repository works too.
 */
export function userDataCommands(role: Role): string[] {
  const head = [
    "set -euxo pipefail",
    `shutdown -h +${SHUTDOWN_MINUTES}`,
    "export DEBIAN_FRONTEND=noninteractive",
    // nothing but the benchmark runs here: no package or snap updates in the middle of a measurement
    "systemctl disable --now apt-daily.timer apt-daily-upgrade.timer || true",
    "snap refresh --hold=24h || true",
    // unattended-upgrades runs at first boot and holds the dpkg locks for a while
    "while fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; do sleep 5; done",
    aptGet("update -y"),
    aptGet("install -y curl git unzip jq iproute2 ethtool build-essential pkg-config"),
    "systemctl disable --now unattended-upgrades.service || true",
    // the slow-client cell (docs/adr/0001, Hardware): fq paces each flow on the server, netem adds the client's round trip
    kernelModule(role === "server" ? "sch_fq" : "sch_netem"),
    // Ubuntu 24.04 has no awscli package: v2 from Amazon, for this machine's architecture
    'curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip',
    "unzip -q /tmp/awscliv2.zip -d /tmp",
    "/tmp/aws/install",
    "rm -rf /tmp/awscliv2.zip /tmp/aws",
    "aws --version",
    `curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}"`,
    "bun --version",
  ];
  if (role === "server") {
    return [...head, `echo "server: bun $(bun --version), $(aws --version)" > ${READY_MARKER}`];
  }
  return [
    ...head,
    // every candidate is built here (docs/adr/0001, Builds) with the stable rustc of the day, installed for the
    // whole machine; SSM's environment has neither variable and only a minimal PATH, so each rustup proxy gets a
    // wrapper in /usr/local/bin that sets them
    `export ${RUST_ENV}`,
    "curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable",
    "for tool in /opt/rust/cargo/bin/*; do",
    `  printf '#!/bin/sh\\nexport ${RUST_ENV}\\nexec %s "$@"\\n' "$tool" > "/usr/local/bin/\${tool##*/}"`,
    '  chmod 755 "/usr/local/bin/${tool##*/}"',
    "done",
    "env -u RUSTUP_HOME -u CARGO_HOME rustc --version",
    "env -u RUSTUP_HOME -u CARGO_HOME cargo --version",
    // the load generator (docs/adr/0001, Hardware), checked against the release's published binary
    `curl -fsSL -o /tmp/oha https://github.com/hatoo/oha/releases/download/v${OHA_VERSION}/oha-linux-arm64`,
    `echo "${OHA_SHA256}  /tmp/oha" | sha256sum -c -`,
    "install -m 755 /tmp/oha /usr/local/bin/oha",
    "rm -f /tmp/oha",
    "oha --version",
    `echo "client: bun $(bun --version), $(aws --version), $(rustc --version), $(cargo --version), $(oha --version)" > ${READY_MARKER}`,
  ];
}

/**
 * The cloud rig of docs/adr/0001: a results bucket, and server and client launch templates in one cluster placement
 * group, which .github/workflows/rig.yml launches a pair from for each pass and drives over SSM.
 */
export class HttpServersBenchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "ResultsBucket", {
      bucketName: `warefeats-http-servers-results-${this.account}`,
      lifecycleRules: [
        // a cancelled upload never reaches its own abort
        { expiration: cdk.Duration.days(90), abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) },
      ],
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const vpc = ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

    const sg = new ec2.SecurityGroup(this, "BenchSg", {
      vpc,
      description: "http-servers bench - intra-group traffic only",
      allowAllOutbound: true,
    });
    sg.addIngressRule(sg, ec2.Port.allTraffic(), "intra-group");

    const placementGroup = new ec2.PlacementGroup(this, "BenchPlacement", {
      strategy: ec2.PlacementGroupStrategy.CLUSTER,
    });

    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")],
    });
    bucket.grantReadWrite(role);

    const template = (lid: string, r: Role, instanceType: string, rootGiB: number) => {
      const userData = ec2.UserData.forLinux();
      userData.addCommands(...userDataCommands(r));
      return new ec2.LaunchTemplate(this, lid, {
        instanceType: new ec2.InstanceType(instanceType),
        machineImage: ec2.MachineImage.fromSsmParameter(UBUNTU_ARM64),
        role,
        userData,
        securityGroup: sg,
        placementGroup,
        blockDevices: [
          {
            deviceName: "/dev/sda1",
            volume: ec2.BlockDeviceVolume.ebs(rootGiB, {
              volumeType: ec2.EbsDeviceVolumeType.GP3,
              deleteOnTermination: true,
            }),
          },
        ],
        requireImdsv2: true,
        instanceInitiatedShutdownBehavior: ec2.InstanceInitiatedShutdownBehavior.TERMINATE,
      });
    };
    const serverLt = template("ServerLt", "server", SERVER_TYPE, 30);
    // the client compiles every candidate
    const clientLt = template("ClientLt", "client", CLIENT_TYPE, 60);

    new cdk.CfnOutput(this, "ServerLtId", { value: serverLt.launchTemplateId! });
    new cdk.CfnOutput(this, "ClientLtId", { value: clientLt.launchTemplateId! });
    new cdk.CfnOutput(this, "PlacementGroup", { value: placementGroup.placementGroupName });
    new cdk.CfnOutput(this, "SecurityGroupId", { value: sg.securityGroupId });
    new cdk.CfnOutput(this, "InstanceRoleArn", { value: role.roleArn });
    new cdk.CfnOutput(this, "ResultsBucketName", { value: bucket.bucketName });
  }
}
