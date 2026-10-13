import {createHash,generateKeyPairSync,createPublicKey,createPrivateKey,diffieHellman,hkdfSync,randomBytes,randomUUID,createCipheriv,createDecipheriv,sign,verify} from 'node:crypto';
import {AppError} from './store.js';
import {PrivateFiles} from './private-files.js';
import type {StorageCapacity} from './storage.js';
import type {Credential} from './chatgpt-auth.js';
import {withChatGPTLock} from './chatgpt-lock.js';

type Host={schema:1;id:string;selected:boolean};
export type TransferRecipient={schema:1;hostId:string;keyId:string;encryptionKey:string;receiptKey:string};
type RecipientSecret={schema:1;recipient:TransferRecipient;encryptionPrivate:string;receiptPrivate:string};
type Header={schema:1;id:string;sourceHostId:string;recipientHostId:string;recipientKeyId:string;connectionId:string;created:number;ephemeralKey:string;nonce:string};
export type TransferBundle={header:Header;ciphertext:string;tag:string};
export type TransferReceipt={schema:1;id:string;digest:string;sourceHostId:string;recipientHostId:string;recipientKeyId:string;connectionId:string;signature:string};
type Outgoing={schema:1;phase:'frozen'|'retiring'|'retired';recipient:TransferRecipient;digest:string;header:Header};
type Incoming={schema:1;phase:'installing'|'active';digest:string;header:Header;receipt:TransferReceipt};
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const bounded=(value:unknown,max=4096):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const hostId=(value:unknown):value is string=>typeof value==='string'&&/^urn:uuid:[0-9a-f-]{36}$/.test(value);
const fail=()=>{throw new AppError(400,'订阅迁移资料无效或不匹配；已有连接保留');};
const pem=(key:{export(options:any):unknown},kind:'spki'|'pkcs8')=>String(key.export({format:'pem',type:kind}));
const aad=(h:Header)=>JSON.stringify([h.schema,h.id,h.sourceHostId,h.recipientHostId,h.recipientKeyId,h.connectionId,h.created,h.ephemeralKey,h.nonce]);
const digest=(b:TransferBundle)=>sha(JSON.stringify([aad(b.header),b.ciphertext,b.tag]));
const receiptBody=(r:Omit<TransferReceipt,'signature'>|TransferReceipt)=>Buffer.from(JSON.stringify([r.schema,r.id,r.digest,r.sourceHostId,r.recipientHostId,r.recipientKeyId,r.connectionId]));
function recipient(value:unknown):TransferRecipient{
 const r=value as TransferRecipient;
 if(!r||r.schema!==1||!hostId(r.hostId)||!bounded(r.encryptionKey)||!bounded(r.receiptKey)||r.keyId!==sha(JSON.stringify([r.encryptionKey,r.receiptKey])))return fail();
 try{if(createPublicKey(r.encryptionKey).asymmetricKeyType!=='x25519'||createPublicKey(r.receiptKey).asymmetricKeyType!=='ed25519')return fail();}catch{return fail();}return r;
}
function bundle(value:unknown):TransferBundle{
 const b=value as TransferBundle,h=b?.header;
 if(!h||h.schema!==1||!bounded(h.id,64)||!hostId(h.sourceHostId)||!hostId(h.recipientHostId)||!bounded(h.recipientKeyId,64)||!bounded(h.connectionId,256)||!Number.isSafeInteger(h.created)||!bounded(h.ephemeralKey)||!bounded(h.nonce,32)||!bounded(b.ciphertext,44000)||!bounded(b.tag,32))return fail();
 if(Buffer.from(h.nonce,'base64url').length!==12||Buffer.from(b.tag,'base64url').length!==16)return fail();return b;
}
function credential(value:unknown):Credential{
 const c=value as Credential;
 if(!c||c.schema!==1||!bounded(c.connectionId,256)||!bounded(c.clientId,256)||c.clientId==='dynamic_agent_client'||!bounded(c.subject,256)||!bounded(c.access,20000)||!bounded(c.refresh,20000)||!bounded(c.idToken,20000)||!Array.isArray(c.scopes)||!['openid','profile','email','offline_access','resource.invoke','chatgpt.tokens.use.direct'].every(s=>c.scopes.includes(s))||!Number.isFinite(c.expires)||typeof c.model!=='string'||typeof c.enabled!=='boolean'||!Number.isSafeInteger(c.maxCalls)||c.maxCalls<0||c.maxCalls>1000||!Number.isFinite(c.timeoutMs)||c.timeoutMs<10000||c.timeoutMs>300000||(c.limitsMode!==undefined&&!['automatic','custom'].includes(c.limitsMode)))return fail();return c;
}
export function assertChatGPTTransferReady(files:PrivateFiles){
 if(files.read('transfer-outgoing.json'))throw new AppError(423,'订阅会话正在迁移或已迁出；源主机停止使用，请由Agent核对迁移回执');
 const incoming=files.read<Incoming>('transfer-incoming.json');if(incoming&&(incoming.schema!==1||incoming.phase!=='active'))throw new AppError(423,'订阅迁移尚未提交；请由Agent继续核对');
}
export class ChatGPTTransfer{
 constructor(private capacity:StorageCapacity,private files:PrivateFiles,private assertIdle:()=>void){}
 private locked<T>(fn:()=>T){return withChatGPTLock(this.files,this.capacity,async()=>{this.assertIdle();return fn();});}
 prepareRecipient(){return this.locked(()=>{
  if(this.files.read('chatgpt.json')||this.files.read('transfer-outgoing.json'))throw new AppError(409,'目标已有订阅连接或迁出记录，不能覆盖');
  let host=this.files.read<Host>('host.json');if(host&&(!hostId(host.id)||host.schema!==1))return fail();
  if(!host){host={schema:1,id:'urn:uuid:'+randomUUID(),selected:false};this.files.save('host.json',host);}
  const prior=this.files.read<RecipientSecret>('transfer-recipient.json');if(prior){const r=recipient(prior.recipient);if(r.hostId!==host.id)return fail();return r;}
  const enc=generateKeyPairSync('x25519'),sig=generateKeyPairSync('ed25519'),encryptionKey=pem(enc.publicKey,'spki'),receiptKey=pem(sig.publicKey,'spki');
  const r:TransferRecipient={schema:1,hostId:host.id,keyId:sha(JSON.stringify([encryptionKey,receiptKey])),encryptionKey,receiptKey};
  this.files.save('transfer-recipient.json',{schema:1,recipient:r,encryptionPrivate:pem(enc.privateKey,'pkcs8'),receiptPrivate:pem(sig.privateKey,'pkcs8')} satisfies RecipientSecret);return r;
 });}
 begin(value:unknown,expectedConnectionId:string){return this.locked(()=>{
  const r=recipient(value),prior=this.files.read<Outgoing>('transfer-outgoing.json');
  if(prior){if(prior.phase!=='frozen'||prior.recipient.keyId!==r.keyId||prior.recipient.hostId!==r.hostId||prior.header.connectionId!==expectedConnectionId)throw new AppError(409,'已有迁移记录，不能建立另一份');const saved=bundle(this.files.read('transfer-offer.json'));if(digest(saved)!==prior.digest)return fail();return saved;}
  if(this.files.read<Incoming>('transfer-incoming.json')?.phase==='installing')throw new AppError(423,'先完成迁入再迁出');
  const host=this.files.read<Host>('host.json'),c=credential(this.files.read('chatgpt.json'));
  if(!host||!hostId(host.id)||!host.selected||c.connectionId!==expectedConnectionId||host.id===r.hostId)return fail();
  const plaintext=Buffer.from(JSON.stringify(c));if(plaintext.length>32000)throw new AppError(413,'订阅迁移资料超过上限');
  const ep=generateKeyPairSync('x25519'),header:Header={schema:1,id:randomUUID(),sourceHostId:host.id,recipientHostId:r.hostId,recipientKeyId:r.keyId,connectionId:c.connectionId,created:Date.now(),ephemeralKey:pem(ep.publicKey,'spki'),nonce:randomBytes(12).toString('base64url')};
  const shared=diffieHellman({privateKey:ep.privateKey,publicKey:createPublicKey(r.encryptionKey)}),key=Buffer.from(hkdfSync('sha256',shared,Buffer.from(header.id),Buffer.from(aad(header)),32));
  let offer:TransferBundle;try{const cipher=createCipheriv('aes-256-gcm',key,Buffer.from(header.nonce,'base64url'));cipher.setAAD(Buffer.from(aad(header)));offer={header,ciphertext:Buffer.concat([cipher.update(plaintext),cipher.final()]).toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};}finally{key.fill(0);shared.fill(0);plaintext.fill(0);}
  // Never return an offer before the source is durably frozen.
  this.files.save('transfer-offer.json',offer);this.files.save('transfer-outgoing.json',{schema:1,phase:'frozen',recipient:r,digest:digest(offer),header} satisfies Outgoing);return offer;
 });}
 accept(value:unknown,expectedSourceHostId:string){return this.locked(()=>{
  const b=bundle(value),hash=digest(b),secret=this.files.read<RecipientSecret>('transfer-recipient.json'),host=this.files.read<Host>('host.json');
  if(!secret||!host)return fail();const r=recipient(secret.recipient);
  if(host.id!==r.hostId||b.header.recipientHostId!==host.id||b.header.recipientKeyId!==r.keyId||!hostId(expectedSourceHostId)||b.header.sourceHostId!==expectedSourceHostId)return fail();
  if(this.files.read('transfer-outgoing.json'))throw new AppError(409,'目标有迁出记录，不能接收');
  const existing=this.files.read<Incoming>('transfer-incoming.json');if(existing){if(existing.schema!==1||existing.digest!==hash)return fail();if(existing.phase==='active')return existing.receipt;if(existing.phase!=='installing')return fail();}
  else if(this.files.read('chatgpt.json'))throw new AppError(409,'目标已有订阅连接，不能覆盖');
  let c:Credential;
  try{
   if(createPublicKey(b.header.ephemeralKey).asymmetricKeyType!=='x25519')return fail();
   const shared=diffieHellman({privateKey:createPrivateKey(secret.encryptionPrivate),publicKey:createPublicKey(b.header.ephemeralKey)}),key=Buffer.from(hkdfSync('sha256',shared,Buffer.from(b.header.id),Buffer.from(aad(b.header)),32));
   let plain:Buffer|undefined;try{const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(b.header.nonce,'base64url'));cipher.setAAD(Buffer.from(aad(b.header)));cipher.setAuthTag(Buffer.from(b.tag,'base64url'));plain=Buffer.concat([cipher.update(Buffer.from(b.ciphertext,'base64url')),cipher.final()]);if(plain.length>32000)return fail();c=credential(JSON.parse(plain.toString()));}finally{key.fill(0);shared.fill(0);plain?.fill(0);}
  }catch{return fail();}
  if(c.connectionId!==b.header.connectionId)return fail();
  const unsigned={schema:1 as const,id:b.header.id,digest:hash,sourceHostId:b.header.sourceHostId,recipientHostId:host.id,recipientKeyId:r.keyId,connectionId:c.connectionId};
  const receipt:TransferReceipt={...unsigned,signature:sign(null,receiptBody(unsigned),secret.receiptPrivate).toString('base64url')};
  const incoming:Incoming={schema:1,phase:'installing',digest:hash,header:b.header,receipt};
  this.files.save('transfer-incoming.json',incoming);
  this.files.save('host.json',{...host,selected:true});this.files.save('chatgpt.json',c);
  // Startup and refresh remain blocked until this final record is committed.
  this.files.save('transfer-incoming.json',{...incoming,phase:'active'});return receipt;
 });}
 finalize(value:unknown){return this.locked(()=>{
  const outgoing=this.files.read<Outgoing>('transfer-outgoing.json'),r=value as TransferReceipt;
  if(!outgoing||!r||r.schema!==1||r.id!==outgoing.header.id||r.digest!==outgoing.digest||r.sourceHostId!==outgoing.header.sourceHostId||r.recipientHostId!==outgoing.recipient.hostId||r.recipientKeyId!==outgoing.recipient.keyId||r.connectionId!==outgoing.header.connectionId||!bounded(r.signature,200))return fail();
  let valid=false;try{valid=verify(null,receiptBody(r),outgoing.recipient.receiptKey,Buffer.from(r.signature,'base64url'));}catch{}if(!valid)return fail();
  if(outgoing.phase!=='retired'){
   const c=this.files.read<Credential>('chatgpt.json');if(c&&c.connectionId!==r.connectionId)return fail();
   this.files.save('transfer-outgoing.json',{...outgoing,phase:'retiring'});this.files.remove('chatgpt.json');this.files.remove('transfer-offer.json');this.files.save('transfer-outgoing.json',{...outgoing,phase:'retired'});
  }
  return {retired:true,transferId:r.id,remoteRevocationAttempted:false};
 });}
}
