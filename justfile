set dotenv-load

default_region := "us-east-1"
aws_account := env("AWS_ACCOUNT", "735853783919")
aws_region := env("AWS_REGION", default_region)

export AWS_DEFAULT_REGION := aws_region
export CDK_DEFAULT_ACCOUNT := aws_account
export CDK_DEFAULT_REGION := aws_region

# The cloud rig (docs/adr/0001): a c8gn.4xlarge server pinned to 4 cores and a c8gn.4xlarge client per pass, dispatched from GitHub
# Actions (.github/workflows/rig.yml) the way kv-stores and map-tile-servers run theirs. Set up once, with AWS
# credentials: rig-deploy, then setup-oidc. After that a run needs only gh.

# Once: deploy the stack (bucket, security group, placement group, launch templates, instance role).
rig-deploy:
    cd infra && bun x cdk deploy --require-approval never --outputs-file ../infra-outputs.json

# Tear the stack down, bucket and results included.
rig-destroy:
    cd infra && bun x cdk destroy --force

# Once, after rig-deploy: the OIDC role the workflow assumes, and its ARN as the environment's AWS_ROLE_ARN secret.
setup-oidc:
    #!/usr/bin/env bash
    set -euo pipefail
    repo_id=$(gh api repos/warefeats/http-servers --jq .id)
    echo "repo id: ${repo_id}"
    org_id="${GITHUB_ORG_ID:-322872963}"
    aws cloudformation deploy \
        --template-file infra/github-oidc-role.yml \
        --stack-name http-servers-github-oidc \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        --no-fail-on-empty-changeset \
        --parameter-overrides \
            GitHubOrg=warefeats \
            GitHubRepository=http-servers \
            GitHubEnvironment=http-servers-bench \
            RepositoryId="${repo_id}" \
            GitHubOrgId="${org_id}" \
            ExistingOidcProviderArn=arn:aws:iam::{{aws_account}}:oidc-provider/token.actions.githubusercontent.com \
        --region {{aws_region}}
    role=$(aws cloudformation describe-stacks \
        --stack-name http-servers-github-oidc \
        --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" \
        --output text \
        --region {{aws_region}})
    echo "role ARN: ${role}"
    # the rig's jobs run in this environment, and its secret is the only place the workflow finds the role
    gh api --method PUT repos/warefeats/http-servers/environments/http-servers-bench --silent
    gh secret set AWS_ROLE_ARN --env http-servers-bench --body "${role}" --repo warefeats/http-servers
    echo "set AWS_ROLE_ARN in the http-servers-bench environment"

# A dispatch: LANE change or frameworks, MODE smoke or full; ARGS go to gh (-f candidates=..., -f region=..., --ref <branch>).
rig-cloud LANE="change" MODE="smoke" *ARGS:
    gh workflow run rig.yml --repo warefeats/http-servers -f lane={{LANE}} -f mode={{MODE}} {{ARGS}}

# Follow the latest dispatch.
rig-watch:
    gh run list --repo warefeats/http-servers --workflow=rig.yml --limit=1 --json databaseId --jq '.[0].databaseId' | xargs gh run watch --repo warefeats/http-servers

# One dispatch's artifacts (one a pass: results, logs, the build record, metadata.json) into runs/raw/<RUN>/.
rig-fetch RUN:
    #!/usr/bin/env bash
    set -euo pipefail
    run={{quote(RUN)}}
    [[ $run =~ ^[0-9]+$ ]] || { echo "rig-fetch: a GitHub run id is all digits, not '$run'" >&2; exit 2; }
    dir=runs/raw/$run
    rm -rf "$dir"
    mkdir -p "$dir"
    gh run download "$run" --repo warefeats/http-servers --dir "$dir"
    find "$dir" -type f | sort

# The offline preflight: run it before every dispatch.
rig-walk:
    bash scripts/rig-walk.sh
