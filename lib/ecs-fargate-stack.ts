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

    const testSG = new SecurityGroup(this, "TestSg", { vpc });

    const externalSg = SecurityGroup.fromSecurityGroupId(
      this,
      "ExternalSg",
      Fn.importValue("external-sg"),
      { mutable: false, allowAllOutbound: true }
    );

    const fargateSG = new SecurityGroup(this, "FargateSg", {
      vpc,
      allowAllOutbound: false,
    });

    const albSG = new SecurityGroup(this, "AlbSg", {
      vpc,
      allowAllOutbound: true,
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

    const loadBalancer = new ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSG,
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
      securityGroups: [fargateSG, externalSg],
    });

    service.attachToApplicationTargetGroup(targetGroup);

    // service.connections.allowFrom(
    //   loadBalancer,
    //   Port.tcp(5000),
    //   "LB to Service HEALTH"
    // );

    service.connections.allowTo(testSG, Port.tcp(7777), "Fargate to TestSg");
  }
}
