import { chromium } from "playwright";
const cx=12,cy=12,turns=2.6,steps=64,maxR=8.5,pts=[];
for(let i=0;i<=steps;i++){const f=i/steps,t=f*turns*Math.PI*2,r=f*maxR;pts.push(`${(cx+r*Math.cos(t)).toFixed(2)} ${(cy+r*Math.sin(t)).toFixed(2)}`);}
const d="M"+pts.join(" L");
const svg=`<svg width="160" height="160" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" fill="#131417"/><path d="${d}" fill="none" stroke="#e06c75" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const p=await b.newPage();await p.setContent(`<body style="margin:0">${svg}</body>`);
await (await p.$("svg")).screenshot({path:process.env.OUT});
await b.close();console.log("rendered");
