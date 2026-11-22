# make.fun tiny-stack-vm-01-run-20261122 — entry brief

The repo holds main.ts (Node 22, runs as `node /bot/main.ts`) plus LICENSE. Total repo size at the submitted commit MUST be <= 8,192 bytes (every file counted) — keep main.ts compact but complete.

## What main.ts must do
For each of 40 instances i001..i040: read /input/<id>/program.bin (bytecode of the tiny stack ISA, see ISA.md IN THIS REPO during the build — it gets deleted before the final commit, do not re-add it) and /input/<id>/input.bin; run the program on a faithful VM; write /output/<id>/stdout.bin (exact output bytes, <=65,536) and /output/<id>/exit.txt (decimal exit code 0-255, newline optional). The reference VM semantics is vm.mjs (also in repo during build only). Honor OUT_DIR env default /output? NO — this contest hardcodes /output.

## Faithfulness checklist (one defect per line — verify each):
- 32-bit two's-complement wrap for ADD/SUB; MUL = low 32 bits of exact product (use Math or BigInt correctly; never float rounding)
- DIV: signed, truncated toward zero; b=0 -> trap 4; -2147483648 / -1 = -2147483648
- MOD: sign of a; x % -1 = 0; b=0 -> trap 4
- DIVU/MODU/LTU: operands read as unsigned 32-bit, result read back as signed
- SHL/SHR/SHRU: count = b AND 31; SHR arithmetic (sign copy), SHRU logical, result read back as signed
- PUSH8 sign-extends (0xFF = -1); PUSH32 signed little-endian
- NEG wraps: -(-2147483648) = -2147483648; NOT bitwise
- EXIT code = v AND 255; IN returns -1 after input exhausted
- Data stack max 256 (overflow trap 3), underflow trap 2; call stack max 64 (overflow trap 7), RET on empty trap 8
- LOAD/STORE addr outside 0..255 trap 6; unknown opcode trap 5
- Trap order each step: (1) 1,000,000 steps already executed -> trap 10; (2) pc outside program -> trap 9; (3) opcode byte no opcode names -> trap 5; (4) immediate cut off -> trap 9; (5) stack needs first (underflow/overflow), then own traps, then effect
- Jump target not validated at jump time; falls outside -> trap 9 on next step; falling off the end is trap 9, never halt
- Output limit: a PRINT/PUTC that would exceed 65,536 bytes writes NOTHING and traps 11; PRINT writes v in decimal ASCII (leading '-', no padding); PUTC writes v AND 255
- Traps keep output written before them; the trapping instruction writes nothing
- HALT exits 0. Everything deterministic; no clock/env reads. One run answers all 40 instances within a 60 s wall budget (fast interpreter, simple dispatch loop is fine).
