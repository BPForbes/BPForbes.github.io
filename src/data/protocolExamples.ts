export const singleBitFullAdderProtocol = `PARAMS: A:1 B:1 Cin:1

MAIN-PROCESS SingleBitFullAdder
SET 0:0 $A
SET 1:0 $B
SET 2:0 0p
CNOT -I $Cin -O 2:0
SET 3:0 0p
SET 4:0 0p

CNOT -I 0:0 -O 3:0
CNOT -I 1:0 -O 3:0
CNOT -I 2:0 -O 3:0

CCNOT -I 0:0 1:0 -O 4:0
CCNOT -I 0:0 2:0 -O 4:0
CCNOT -I 1:0 2:0 -O 4:0

MEASURE -I 3
MEASURE -I 4
RETURNVALS 3 4`;

export const twoBitFullAdderProtocol = `PARAMS: A0:state A1:state B0:state B1:state Cin:state

MAIN-PROCESS TwoBitFullAdder
DECLARECHILD SingleBitFullAdder
CREATETOKEN -I Cmid S0tmp S1tmp

SET Cmid:0 0p

SET A0:0 $A0
SET B0:0 $B0
SET Cin:0 $Cin
RUNCHILD SingleBitFullAdder -I $A0 $B0 $Cin -O S0tmp Cmid:0
ACCEPTVALS S0tmp Cmid
SET Sum0 S0tmp

SET A1:0 $A1
SET B1:0 $B1
RUNCHILD SingleBitFullAdder -I $A1 $B1 Cmid -O S1tmp Cout
ACCEPTVALS S1tmp Cout
SET Sum1 S1tmp

RETURNVALS S0tmp S1tmp Cout`;

export const fourBitFullAdderProtocol = `PARAMS: A0:state A1:state A2:state A3:state \
        B0:state B1:state B2:state B3:state \
        Cin:state Sum0:int Sum1:int Sum2:int Sum3:int Cout:int

MAIN-PROCESS FourBitFullAdder
DECLARECHILD TwoBitFullAdder
CREATETOKEN -I C2 C4

SET A0:0 $A0
SET A1:0 $A1
SET B0:0 $B0
SET B1:0 $B1
SET Cin:0 $Cin
RUNCHILD TwoBitFullAdder \
  -I $A0 $A1 $B0 $B1 $Cin \
  -O Sum0 Sum1 C2:0
ACCEPTVALS Sum0 Sum1 C2

INCREASECYCLE

SET A2:1 $A2
SET A3:1 $A3
SET B2:1 $B2
SET B3:1 $B3
RUNCHILD TwoBitFullAdder \
  -I $A2 $A3 $B2 $B3 C2 \
  -O Sum2 Sum3 C4:1
ACCEPTVALS Sum2 Sum3 C4
RETURNVALS Sum0 Sum1 Sum2 Sum3 C4`;

export const phaseDemoProtocol = `PARAMS: Theta:float

MAIN-PROCESS PhaseDemo
SET 0:0 0p
H -I 0:0 -O 0:0
PHASE=1.5708 -I 0:0 -O 0:0
BPHASE=0.7854 -I 0:0 -O 0:0
MEASURE -I 0`;

export const protocolLibrary = {
  SingleBitFullAdder: singleBitFullAdderProtocol,
  TwoBitFullAdder: twoBitFullAdderProtocol,
};

export const protocolExamples = [
  { name: 'Four-bit full adder AST', source: fourBitFullAdderProtocol },
  { name: 'Two-bit full adder AST', source: twoBitFullAdderProtocol },
  { name: 'Single-bit full adder AST', source: singleBitFullAdderProtocol },
  { name: 'PHASE / BPHASE demo', source: phaseDemoProtocol },
];
