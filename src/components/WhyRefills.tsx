import { Droplets, HandHeart, RefreshCw, Waves } from 'lucide-react'
import BioreactorScene from './BioreactorScene'

const reasons = [
  { icon: Waves, title: 'Circulation is the engine', text: 'A pump lifts water from the tank and runs it down the inclined panel as a thin film. Spread thin, the algae get light and meet the passing air, where they take up carbon dioxide and release oxygen.' },
  { icon: RefreshCw, title: 'Moving water keeps algae healthy', text: 'Circulation stops the algae settling at the bottom of the tank and keeps the film on the panel from drying out.' },
  { icon: Droplets, title: 'So the tank needs topping up', text: 'As the film runs over the panel, water evaporates. Regular refills keep the circulation, and the algae, going.' },
  { icon: HandHeart, title: 'Care, shared and rewarded', text: 'Instead of a maintenance crew, anyone nearby can refill a unit. The machine verifies every refill, so credits reward real care.' },
]

const loop = ['Pump lifts tank water', 'Hose releases it on the panel', 'A thin film meets the air', 'Water returns to the tank']

export default function WhyRefills() {
  return <section className="why-section page-shell" id="why-refills">
    <div className="section-intro"><span className="eyebrow">WHY REFILLS?</span><h2>Algae need <em>moving water.</em></h2><p>The algae in every unit live in water, and that water has to keep circulating. That is why each unit invites the people around it to top it up.</p></div>
    <div className="why-layout">
      <figure className="why-figure">
        {/* Close-up of the pump → hose → film → tank loop from the landing-page scene */}
        <BioreactorScene viewBox="826 548 356 330"/>
        <figcaption><ol>{loop.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></figcaption>
      </figure>
      <div className="why-reasons">{reasons.map(({ icon: Icon, title, text }) => <article key={title}><span className="why-icon"><Icon size={20} strokeWidth={1.6}/></span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
    </div>
  </section>
}
