import { Fn, Stack, StackProps } from "aws-cdk-lib";
import { Port, SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import {
  Cluster,
  Compatibility,
  ContainerImage,
  FargateService,
  TaskDefinition,
} from "aws-cdk-lib/aws-ecs";
import {
  ApplicationLoadBalancer,
  ApplicationTargetGroup,
  ListenerAction,
  ListenerCertificate,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";

export class EcsFargateStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "Vpc", {});

    const cluster = new Cluster(this, "Cluster", {
      vpc: vpc,
    });

    const externalDbSg = SecurityGroup.fromSecurityGroupId(
      this,
      "ExternalDbSg",
      Fn.importValue("external-database-sg"),
      { mutable: false, allowAllOutbound: true }
    );

    const fargateSG = new SecurityGroup(this, "FargateSg", {
      vpc,
    });

    const targetGroup = new ApplicationTargetGroup(this, "TargetGroup", {
      vpc,
      healthCheck: {
        path: "/",
        port: "5000",
        healthyHttpCodes: "200",
      },
      port: 8080,
    });

    new ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
    }).addListener("Listener", {
      port: 443,
      certificates: [ListenerCertificate.fromArn("arn")],
      defaultAction: ListenerAction.forward([targetGroup]),
    });

    const task = new TaskDefinition(this, "Task", {
      compatibility: Compatibility.FARGATE,
      cpu: "512",
      memoryMiB: "1024",
    });

    task.addContainer("Image", {
      image: ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      portMappings: [{ containerPort: 8080 }, { containerPort: 5000 }],
    });

    const service = new FargateService(this, "FargateService", {
      cluster: cluster,
      taskDefinition: task,
      securityGroups: [fargateSG, externalDbSg],
    });

    service.attachToApplicationTargetGroup(targetGroup);

    // In cases where an Ingress Rule is created, mutable:false is considered
    // and no Rule will be created for the "ExternalDBbSg" unless set to true.
    //
    //   service.connections.allowFrom(
    //     loadBalancer,
    //     Port.tcp(5000),
    //     "LB to Service HEALTH"
    //   );
  }
}
