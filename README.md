# env-hacks-2026

Repository overview for the .env team project covering the full stack of the algae-based air purification solution.

## Team

- Sre Varshan S
- Pranav S
- Shamyukthaa D
- Archana S

## Project Summary

This project combines environmental sensing, cloud monitoring, and a web application to showcase a thin-film algae-based air purification system. The repository contains multiple branch-specific implementations that together demonstrate the end-to-end system across hardware, backend, and frontend.

## Branch Overview

| Branch | Purpose | AWS Services Used |
|---|---|---|
| `iot-air-node` | ESP32-based environmental sensing node for air-quality monitoring and telemetry collection | Amazon API Gateway, AWS Lambda, Amazon DynamoDB |
| `webapp-frontend` | React + TypeScript frontend for dashboards, maps, rewards, and user login | AWS Amplify, Amazon Cognito, AWS Amplify Hosting |
| `web-app-backend` | FastAPI backend for user authentication, machine data, refill logic, rewards, and API services | AWS Lambda, Amazon RDS for PostgreSQL, Amazon Cognito, Amazon ECR, AWS Lambda Function URL |
| `main` | Central branch for repo documentation and project overview | N/A (documentation branch) |

## Branch Details

### 1) iot-air-node
This branch contains the embedded firmware for the air-sensing unit built around the ESP32 microcontroller. It reads environmental data using sensors such as BME680 and transmits collected readings over LoRa and HTTPS.

**AWS services used:**
- Amazon API Gateway
- AWS Lambda
- Amazon DynamoDB

This branch represents the physical sensing layer of the system and is responsible for collecting and forwarding telemetry to the cloud.

### 2) webapp-frontend
This branch contains the frontend application for displaying environmental data, node status, dashboard analytics, team information, and reward features. It is built using React and Vite.

**AWS services used:**
- AWS Amplify
- AWS Amplify Hosting
- Amazon Cognito

This branch provides the user-facing experience and supports authentication and deployment via AWS Amplify.

### 3) web-app-backend
This branch contains the backend service for the application, including authentication, session management, machine data, refill verification, points, and rewards logic.

**AWS services used:**
- AWS Lambda
- Amazon RDS for PostgreSQL
- Amazon Cognito
- Amazon ECR
- AWS Lambda Function URL

This branch provides the business logic and persistent backend layer that supports the full ecosystem.

## Architecture Summary

The repository demonstrates a complete smart environmental monitoring solution:

- ESP32 node collects sensor readings
- Cloud services receive and process telemetry
- Backend validates data and handles user workflows
- Frontend presents dashboards and engagement features
- AWS services support hosting, authentication, APIs, and data management

## AWS Services Used Across the Project

- AWS Amplify
- AWS Amplify Hosting
- Amazon Cognito
- Amazon API Gateway
- AWS Lambda
- Amazon DynamoDB
- Amazon RDS for PostgreSQL
- Amazon ECR
- AWS Lambda Function URL
- AWS CLI v2

## Tools and Technologies

- **Hardware:** ESP32, BME680 sensor, SX1278 LoRa module
- **Frontend:** React, TypeScript, Vite
- **Backend:** FastAPI, SQLAlchemy, Python 3.12
- **Database:** Amazon RDS for PostgreSQL
- **Infrastructure:** Docker, AWS Lambda, AWS CLI v2
- **Authentication:** Amazon Cognito

## Repository Purpose

The project aims to combine:
- Environmental sensing
- Cloud-based monitoring
- Interactive web interfaces
- Energy-efficient and sustainable product design
- Real-world deployment concepts for algae-based air purification

## License

This project is licensed under the MIT License. See the LICENSE file for details.
