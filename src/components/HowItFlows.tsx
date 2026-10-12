import { ChartLine, Cloud, Coins, Cpu, Droplets, Gauge, QrCode, RadioTower, UserRound, type LucideIcon } from 'lucide-react'

type Step = { icon: LucideIcon; title: string; text: string }

const refill: Step[] = [
  { icon: QrCode, title: 'Scan the unit’s QR', text: 'Every unit carries its own QR code: a unique link to that machine on our platform, like /m/NODE-001.' },
  { icon: UserRound, title: 'Log in or register', text: 'The link opens sign-in. New users register and verify their email with Amazon Cognito.' },
  { icon: Droplets, title: 'Hydrate the algae', text: 'Our backend opens a refill session for that exact machine, and the user pours water into the tank.' },
  { icon: Gauge, title: 'The machine validates', text: 'The unit measures the water that actually flowed in and reports it; the backend verifies the volume.' },
  { icon: Coins, title: 'Credits land', text: '1 credit per verified litre goes to the user’s account, ready to redeem for eco-rewards.' },
]

const sensor: Step[] = [
  { icon: Cpu, title: 'The unit senses', text: 'An ESP32 with a BME680 reads temperature, humidity, pressure, and gas resistance every 10 seconds.' },
  { icon: RadioTower, title: 'Wi-Fi, or LoRa', text: 'Online units send over HTTPS. Without internet, readings hop node to node over LoRa to a fog node that forwards them.' },
  { icon: Cloud, title: 'AWS stores it', text: 'Amazon API Gateway and AWS Lambda validate each reading and store it in Amazon DynamoDB.' },
  { icon: ChartLine, title: 'Live dashboard', text: 'Anyone can follow each unit’s readings and history, refreshed every 10 seconds.' },
]

function Lane({ tone, eyebrow, title, services, steps }: { tone: 'refill' | 'sensor'; eyebrow: string; title: string; services: string; steps: Step[] }) {
  return <div className={`flow-lane flow-${tone}`}>
    <div className="flow-lane-head"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><span className="flow-services">{services}</span></div>
    <ol className="flow-steps" style={{ '--steps': steps.length } as React.CSSProperties}>
      {steps.map(({ icon: Icon, title, text }, index) => <li key={title} className="flow-step">
        <span className="flow-icon"><Icon size={22} strokeWidth={1.6}/><span className="flow-number">{index + 1}</span></span>
        <h4>{title}</h4><p>{text}</p>
      </li>)}
    </ol>
  </div>
}

export default function HowItFlows() {
  return <section className="flow-section page-shell" id="flow">
    <div className="section-intro"><span className="eyebrow">HOW IT FLOWS</span><h2>Two flows, one <em>living system.</em></h2><p>People keep the algae going, and the algae’s environment is measured and shared. Here is each journey, step by step.</p></div>
    <Lane tone="refill" eyebrow="REFILL & REWARDS" title="From a QR scan to credits" services="Amplify · Cognito · Lambda · RDS" steps={refill}/>
    <Lane tone="sensor" eyebrow="SENSOR DATA" title="From the unit to the dashboard" services="API Gateway · Lambda · DynamoDB" steps={sensor}/>
    <p className="flow-note">In the current prototype, the refill water measurement is simulated while the unit’s flow sensor is integrated.</p>
  </section>
}
