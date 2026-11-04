type IllustrationVariant='journeys'|'about';

export function KynIllustration({variant}:{variant:IllustrationVariant}){
 const title=variant==='journeys'?'Two neighbors walking through the city':'Neighbors walking past street trees and a subway entrance';
 return <svg className={`kyn-illustration kyn-illustration-${variant}`} viewBox="0 0 520 240" role="img" aria-label={title}>
  <rect x="0" y="0" width="520" height="240" rx="12" fill="var(--soft)"/>
  <path d="M0 190H520V240H0Z" fill="var(--sage)"/>
  <path d="M28 190H492" stroke="var(--paper)" strokeWidth="8" strokeLinecap="round"/>
  <g className="illustration-tree" transform="translate(62 30)">
   <path d="M40 67V160" stroke="var(--ink)" strokeWidth="8" strokeLinecap="round"/>
   <circle cx="40" cy="42" r="38" fill="var(--salt)"/>
   <circle cx="18" cy="57" r="24" fill="var(--aloe)"/>
   <circle cx="65" cy="64" r="27" fill="var(--sage)"/>
  </g>
  <g className="illustration-subway" transform="translate(354 71)">
   <path d="M0 119V45C0 24 17 7 38 7H116V119" fill="var(--paper)" stroke="var(--ink)" strokeWidth="6"/>
   <path d="M18 119V59C18 43 31 30 47 30H98V119" fill="var(--salt)" stroke="var(--ink)" strokeWidth="5"/>
   <path d="M15 8H116" stroke="var(--ink)" strokeWidth="10" strokeLinecap="round"/>
   <circle cx="38" cy="8" r="18" fill="var(--ink)"/>
   <path d="M31 8h14M38 1v14" stroke="var(--paper)" strokeWidth="4" strokeLinecap="round"/>
   <path d="M35 89h56M35 104h56" stroke="var(--paper)" strokeWidth="5" strokeLinecap="round"/>
  </g>
  <g className="illustration-person" transform="translate(171 57)">
   <circle cx="31" cy="24" r="19" fill="var(--salt)" stroke="var(--ink)" strokeWidth="5"/>
   <path d="M29 45 20 94l-8 55M24 92l39 20 20 42M25 59l37 30" fill="none" stroke="var(--ink)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
   <path d="M23 53c23 1 40 14 46 35" fill="none" stroke="var(--aloe)" strokeWidth="17" strokeLinecap="round"/>
  </g>
  <g className="illustration-person" transform="translate(256 50)">
   <circle cx="30" cy="24" r="19" fill="var(--aloe)" stroke="var(--ink)" strokeWidth="5"/>
   <path d="M31 45 26 95l-24 52M27 94l34 20 6 42M27 60 5 88" fill="none" stroke="var(--ink)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
   <path d="M27 53c17 2 31 14 36 34" fill="none" stroke="var(--salt)" strokeWidth="17" strokeLinecap="round"/>
  </g>
  <path d="M201 199c34 10 71 10 108 0" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" opacity=".22"/>
 </svg>;
}
