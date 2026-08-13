#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StremioItalianHttpsStack } from '../lib/stremio-italian-https-stack';

const app = new cdk.App();
new StremioItalianHttpsStack(app, 'StremioItalianHttpsStack');
