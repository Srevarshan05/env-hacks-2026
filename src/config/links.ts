// Public project links shown on the site.
export const links = {
  repo: 'https://github.com/Srevarshan05/env-hacks-2026',
  branch: (name: string) => `https://github.com/Srevarshan05/env-hacks-2026/tree/${name}`,
}

// One branch per part of the system (descriptions follow each branch's README).
export const repoBranches = [
  { name: 'iot-air-node', what: 'ESP32 air-quality node firmware: reads the BME680 every 10 seconds and sends each reading over LoRa and over HTTPS to API Gateway, Lambda, and DynamoDB.' },
  { name: 'web-app-backend', what: 'FastAPI refill backend on AWS Lambda: Cognito sign-in, QR machine sessions, verified refills, the points ledger, and rewards on Amazon RDS for PostgreSQL.' },
  { name: 'webapp-frontend', what: 'React + Vite web app on AWS Amplify Hosting: landing story, live sensor dashboard, QR refill pages, profile, rewards, and the behind-the-scenes gallery.' },
]
