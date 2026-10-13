const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shown=rows=>rows.filter(x=>x.visible!==false);
const icon='<img class="icon" src="assets/arrow-right.svg" alt="">';
function text(selector,value){const el=$(selector);if(el){el.textContent=value;el.style.whiteSpace='pre-line';}}
function apply(c){
 if($('#hero-title')){
  text('#hero-title',c.home.title);text('.hero-copy p',c.home.description);$('.reception').src=c.home.image;$('.reception').alt='Интерьер клиники ЭлДент';
  text('#about h2',c.about.title);text('#about .section-copy',c.about.description);const desc=$('#about .section-copy');
  if(c.about.history){const p=document.createElement('p');p.className='section-copy';p.textContent=c.about.history;p.style.whiteSpace='pre-line';desc.after(p);}
  if(c.about.image){const img=document.createElement('img');img.src=c.about.image;img.alt='Клиника ЭлДент';img.style.cssText='width:100%;border-radius:20px;margin:24px 0';desc.after(img);}
  $('.about-steps').innerHTML=shown(c.about.advantages).map((x,i)=>`<article><span class="step-no">${String(i+1).padStart(2,'0')}</span><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p></article>`).join('');
  $('.service-grid').innerHTML=shown(c.services).map(x=>`<button class="service" data-service="${esc(x.name)}"><span><h3>${esc(x.name)}</h3><p>${esc(x.description)}</p></span><span class="circle-arrow">${icon}</span></button>`).join('');
  $('select[name=service]').innerHTML='<option>Нужна консультация</option>'+shown(c.services).map(x=>`<option>${esc(x.name)}</option>`).join('');
  $('.doctor-grid').innerHTML=shown(c.doctors).map(x=>`<article class="doctor"><div class="doctor-photo"><img src="${esc(x.image)}" alt="${esc(x.name)}" loading="lazy" width="510" height="680"></div><span class="doctor-role">${esc(x.role)}</span><h3>${esc(x.name)}</h3><p>${esc(x.specialty)}</p>${x.description?`<p>${esc(x.description)}</p>`:''}<button class="text-link" data-doctor="${esc(x.name)}">Записаться к врачу${icon}</button></article>`).join('');
  $('.questions').innerHTML=shown(c.home.faq).map(x=>`<details><summary>${esc(x.question)}</summary><p>${esc(x.answer)}</p></details>`).join('');
  text('.contact-details>div:first-child p',c.contacts.address);text('.contact-details>div:nth-child(2) p',c.contacts.hours);
  const all=c.prices.categories.flatMap(x=>shown(x.rows));const sample=[all.find(x=>x.name.includes('Приём (осмотр')),all.find(x=>x.name.includes('кариеса поверхностного')),all.find(x=>x.name.includes('Профессиональная гигиена полости рта (УЗ')),all.find(x=>x.name==='Винир керамический')].filter(Boolean);
  const box=$('.price-list');box.innerHTML=sample.map(x=>`<div><span>${esc(x.name)}</span><strong>${esc(x.price)}</strong></div>`).join('')+'<p class="fine">Итоговую стоимость и дополнительные процедуры уточняйте у администратора.</p>';
  $('.address-card>span:last-child').firstChild.textContent=c.contacts.address;
 }
 if($('#price-search')){
  const categories=c.prices.categories.map(x=>({...x,rows:shown(x.rows)})).filter(x=>x.rows.length);const total=categories.reduce((n,x)=>n+x.rows.length,0);
  $('.category-list').innerHTML=`<button class="category-button selected" data-category="all" aria-pressed="true">Все услуги<span>${total}</span></button>`+categories.map(x=>`<button class="category-button" data-category="${esc(x.id)}" aria-pressed="false">${esc(x.name)}<span>${x.rows.length}</span></button>`).join('');
  $('#price-results').innerHTML=categories.map(x=>`<section class="price-category" data-group="${esc(x.id)}"><table class="price-table"><caption>${esc(x.name)}</caption><thead><tr><th scope="col">Услуга</th><th scope="col">Стоимость</th></tr></thead><tbody>${x.rows.map(r=>`<tr data-search="${esc(r.name+' '+r.price+' '+x.name)}"><td>${esc(r.name)}</td><td>${esc(r.price)}</td></tr>`).join('')}</tbody></table></section>`).join('');
 }
 const digits=c.contacts.phone.replace(/[^\d+]/g,'');document.querySelectorAll('a[href^="tel:"]').forEach(a=>{a.href='tel:'+digits;const hasIcon=a.querySelector('img');a.textContent=(a.classList.contains('button')?'Позвонить ':'')+c.contacts.phone;if(hasIcon)a.append(hasIcon);});
 document.querySelectorAll('a[href^="mailto:"]').forEach(a=>{a.href='mailto:'+c.contacts.email;a.textContent=c.contacts.email;});
 document.querySelectorAll('a[href="https://elladent.ru/page16.html"]').forEach(a=>a.href=c.contacts.bookingUrl);
 document.querySelectorAll('a[href^="https://yandex.ru/maps/"]').forEach(a=>a.href='https://yandex.ru/maps/?text='+encodeURIComponent(c.contacts.address));
 const footer=$('footer>div');if(footer){footer.querySelectorAll('a').forEach(a=>a.remove());for(const doc of shown(c.documents)){const a=document.createElement('a');a.href=doc.url;a.textContent=doc.name;a.target='_blank';a.rel='noopener';footer.append(a);}}
}
try{const res=await fetch('/api/content',{cache:'no-store'});if(res.ok){const c=await res.json();if(c.home&&c.prices)apply(c);}}catch{ /* Static preview retains original content. */ }
await import($('#price-search')?'./prices.js':'./app.js');
