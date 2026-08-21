const toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('.main-nav');
if(toggle&&nav){toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',open)});nav.addEventListener('click',()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false')})}
