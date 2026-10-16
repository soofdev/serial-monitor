// Pin Monitor demo — ESP32 DevKit V1 (30-pin / DOIT / NodeMCU-32).
//
// Drives the protocol that lights up the Pins panel in Serial Monitor:
//   $HELLO   announces the board so the diagram auto-switches
//   $MODE    declares pin direction
//   $PIN     emits state for every change
//
// Wiring (all optional — sketch runs with nothing attached):
//   GPIO2  — onboard blue LED, always present.
//   GPIO4  — external LED to GND through ~330 ohm resistor.
//   GPIO16 — external LED to GND through ~330 ohm resistor.
//   GPIO17 — external LED to GND through ~330 ohm resistor.
//   GPIO34 — analog input. Tie to a 10 kohm potentiometer between
//            3V3 and GND (wiper to GPIO34) to see live ADC values.

const int PIN_LED    = 2;   // onboard
const int PIN_A      = 4;
const int PIN_B      = 16;
const int PIN_C      = 17;
const int PIN_ANALOG = 34;  // input-only

void emitHello() {
  Serial.println("$HELLO esp32-devkit-v1");
}

void emitModes() {
  Serial.print("$MODE ");
  Serial.print(PIN_LED);    Serial.print("=OUT ");
  Serial.print(PIN_A);      Serial.print("=OUT ");
  Serial.print(PIN_B);      Serial.print("=OUT ");
  Serial.print(PIN_C);      Serial.print("=OUT ");
  Serial.print(PIN_ANALOG); Serial.println("=AIN");
}

void emitDigital(int led, int a, int b, int c) {
  Serial.print("$PIN ");
  Serial.print(PIN_LED); Serial.print("="); Serial.print(led); Serial.print(" ");
  Serial.print(PIN_A);   Serial.print("="); Serial.print(a);   Serial.print(" ");
  Serial.print(PIN_B);   Serial.print("="); Serial.print(b);   Serial.print(" ");
  Serial.print(PIN_C);   Serial.print("="); Serial.println(c);
}

void emitAnalog(int raw) {
  Serial.print("$PIN ");
  Serial.print(PIN_ANALOG); Serial.print("=A:");
  Serial.println(raw);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_A,   OUTPUT);
  pinMode(PIN_B,   OUTPUT);
  pinMode(PIN_C,   OUTPUT);
  // GPIO34 is input-only; no pinMode call needed for analogRead.

  delay(300);
  emitHello();
  emitModes();
  Serial.println("Demo started — three-LED chase + onboard LED + analog sweep");
}

void loop() {
  static uint32_t step = 0;
  static uint32_t lastAnalog = 0;

  // 3-LED chase across PIN_A / PIN_B / PIN_C, plus onboard LED toggling every full cycle.
  int phase = step % 3;
  int a   = (phase == 0) ? 1 : 0;
  int b   = (phase == 1) ? 1 : 0;
  int c   = (phase == 2) ? 1 : 0;
  int led = ((step / 3) & 1);   // flips every 3 steps

  digitalWrite(PIN_LED, led);
  digitalWrite(PIN_A,   a);
  digitalWrite(PIN_B,   b);
  digitalWrite(PIN_C,   c);
  emitDigital(led, a, b, c);

  // Analog read at ~5 Hz, independent of the chase.
  uint32_t now = millis();
  if (now - lastAnalog >= 200) {
    int raw = analogRead(PIN_ANALOG);  // 0..4095 on ESP32
    emitAnalog(raw);
    lastAnalog = now;
  }

  // Normal log line — stays in terminal even when "Show pin protocol" is off.
  Serial.print("step=");
  Serial.println(step);

  step++;
  delay(250);
}
