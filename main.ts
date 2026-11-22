import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs';
import{join}from'node:path';
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output';
const SM=256,CM=64,MW=256,SL=1_000_000,OM=65_536;
// Opcode byte -> [name, immediate bytes, values popped, values pushed]. Traps double as exit codes,
// keeping output already written: 2 under, 3 over, 4 div0, 5 opcode, 6 memory, 7 calls, 8 empty RET,
// 9 pc/immediate, 10 steps, 11 output. These docs and vm.mjs are build-only, so this is the in-repo spec.
const OP=new Map<number,[string,number,number,number]>([
[0,['HALT',0,0,0]],[1,['PUSH8',1,0,1]],[2,['PUSH32',4,0,1]],[3,['POP',0,1,0]],[4,['DUP',0,1,2]],
[5,['SWAP',0,2,2]],[6,['OVER',0,2,3]],[7,['ROT',0,3,3]],[0x10,['ADD',0,2,1]],[0x11,['SUB',0,2,1]],
[0x12,['MUL',0,2,1]],[0x13,['DIV',0,2,1]],[0x14,['MOD',0,2,1]],[0x15,['DIVU',0,2,1]],[0x16,['MODU',0,2,1]],
[0x17,['NEG',0,1,1]],[0x18,['AND',0,2,1]],[0x19,['OR',0,2,1]],[0x1a,['XOR',0,2,1]],[0x1b,['NOT',0,1,1]],
[0x1c,['SHL',0,2,1]],[0x1d,['SHR',0,2,1]],[0x1e,['SHRU',0,2,1]],[0x20,['EQ',0,2,1]],[0x21,['LT',0,2,1]],
[0x22,['LTU',0,2,1]],[0x30,['JMP',2,0,0]],[0x31,['JZ',2,1,0]],[0x32,['JNZ',2,1,0]],[0x33,['CALL',2,0,0]],
[0x34,['RET',0,0,0]],[0x40,['LOAD',0,1,1]],[0x41,['STORE',0,2,0]],[0x50,['PRINT',0,1,0]],[0x51,['PUTC',0,1,0]],
[0x52,['IN',0,0,1]],[0x53,['EXIT',0,1,0]],
]);
const enc=new TextEncoder();
function run(program:Uint8Array,input:Uint8Array){
  const n=program.length,D=new Int32Array(SM);let sp=0;
  const C=new Int32Array(CM);let csp=0;
  const M=new Int32Array(MW);
  const out=new Uint8Array(OM);let olen=0,inPos=0,pc=0,steps=0;
  const trap=(c:number)=>({out:out.slice(0,olen),exit:c});
  for(;;){
    if(steps===SL)return trap(10);
    if(pc<0||pc>=n)return trap(9);
    const op=OP.get(program[pc]);
    if(!op)return trap(5);
    const [name,imm,pops,pushes]=op;
    if(pc+imm>=n)return trap(9);
    steps++;
    const next=pc+1+imm;
    if(sp<pops)return trap(2);
    if(sp-pops+pushes>SM)return trap(3);
    pc=next;
    switch(name){
      case'HALT':return{out:out.slice(0,olen),exit:0};
      case'PUSH8':D[sp++]=(program[next-1]<<24)>>24;break;
      case'PUSH32':D[sp++]=program[next-4]|(program[next-3]<<8)|(program[next-2]<<16)|(program[next-1]<<24);break;
      case'POP':sp--;break;
      case'DUP':D[sp]=D[sp-1];sp++;break;
      case'SWAP':{const t=D[sp-1];D[sp-1]=D[sp-2];D[sp-2]=t;break;}
      case'OVER':D[sp]=D[sp-2];sp++;break;
      case'ROT':{const a=D[sp-3];D[sp-3]=D[sp-2];D[sp-2]=D[sp-1];D[sp-1]=a;break;}
      case'NEG':D[sp-1]=-D[sp-1]|0;break;
      case'NOT':D[sp-1]=~D[sp-1];break;
      case'ADD':case'SUB':case'MUL':case'DIV':case'MOD':case'DIVU':case'MODU':case'AND':case'OR':case'XOR':case'SHL':case'SHR':case'SHRU':case'EQ':case'LT':case'LTU':{
        const b=D[sp-1],a=D[sp-2];let r=0;
        switch(name){
          case'ADD':r=(a+b)|0;break;
          case'SUB':r=(a-b)|0;break;
          case'MUL':r=Math.imul(a,b);break;
          case'DIV':if(b===0)return trap(4);r=a===-2147483648&&b===-1?a:(a/b)|0;break;
          case'MOD':if(b===0)return trap(4);r=b===-1?0:a%b|0;break;
          case'DIVU':if(b===0)return trap(4);r=Math.floor((a>>>0)/(b>>>0))|0;break;
          case'MODU':if(b===0)return trap(4);r=((a>>>0)%(b>>>0))|0;break;
          case'AND':r=a&b;break;
          case'OR':r=a|b;break;
          case'XOR':r=a^b;break;
          case'SHL':r=a<<(b&31);break;
          case'SHR':r=a>>(b&31);break;
          case'SHRU':r=(a>>>(b&31))|0;break;
          case'EQ':r=a===b?1:0;break;
          case'LT':r=a<b?1:0;break;
          case'LTU':r=(a>>>0)<(b>>>0)?1:0;break;
        }
        sp-=2;D[sp++]=r;break;
      }
      case'JMP':case'JZ':case'JNZ':{
        const rel=((program[next-2]|(program[next-1]<<8))<<16)>>16;
        let take=true;
        if(name!=='JMP'){const v=D[--sp];take=name==='JZ'?v===0:v!==0;}
        if(take)pc=next+rel;
        break;
      }
      case'CALL':
        if(csp===CM)return trap(7);
        C[csp++]=next;
        pc=program[next-2]|(program[next-1]<<8);
        break;
      case'RET':
        if(csp===0)return trap(8);
        pc=C[--csp];
        break;
      case'LOAD':{
        const addr=D[sp-1];
        if(addr<0||addr>=MW)return trap(6);
        D[sp-1]=M[addr];
        break;
      }
      case'STORE':{
        const addr=D[sp-1],v=D[sp-2];
        if(addr<0||addr>=MW)return trap(6);
        sp-=2;M[addr]=v;
        break;
      }
      case'PRINT':{
        const bytes=enc.encode(String(D[sp-1]));
        if(olen+bytes.length>OM)return trap(11);
        sp--;out.set(bytes,olen);olen+=bytes.length;
        break;
      }
      case'PUTC':
        if(olen+1>OM)return trap(11);
        out[olen++]=D[--sp]&255;
        break;
      case'IN':
        D[sp++]=inPos<input.length?input[inPos++]:-1;
        break;
      case'EXIT':
        return{out:out.slice(0,olen),exit:D[--sp]&255};
    }
  }
}
// Only iNNN directories are instances; a stray file in /input must not abort the other 39 answers.
for(const id of readdirSync(I).sort()){
  if(!/^i\d{3}$/.test(id))continue;
  const p=readFileSync(join(I,id,'program.bin'));
  const inp=readFileSync(join(I,id,'input.bin'));
  const r=run(p,inp);
  mkdirSync(join(O,id),{recursive:true});
  writeFileSync(join(O,id,'stdout.bin'),r.out);
  writeFileSync(join(O,id,'exit.txt'),String(r.exit)+'\n');
}
