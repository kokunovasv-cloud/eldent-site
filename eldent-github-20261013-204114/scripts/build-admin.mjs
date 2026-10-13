import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/admin',{recursive:true});
await cp('src/admin','public/admin',{recursive:true});
