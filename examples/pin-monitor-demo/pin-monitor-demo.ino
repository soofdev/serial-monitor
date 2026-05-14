// Pin Monitor demo sketch — ESP32-S3
//
// Demonstrates the $HELLO / $MODE / $PIN serial protocol that drives the
// Pins panel in Serial Monitor. Flash to an ESP32-S3-DevKitC-1, open the
// device in Serial Monitor, click "Pins" in the toolbar, and watch the
// pin pads update as the loop runs.

const int PIN_A = 5;
const int PIN_B = 18;
const int PIN_C = 48;  // RGB LED on N8R8 / N16R8 variants

void emitMode() {
  Serial.print("$MODE ");
  Serial.print(PIN_A); Serial.print("=OUT ");
  Serial.print(PIN_B); Serial.print("=OUT ");
  Serial.print(PIN_C); Serial.println("=OUT");
}

void emitState(int a, int b, int c) {
  Serial.print("$PIN ");
  Serial.print(PIN_A); Serial.print("="); Serial.print(a); Serial.print(" ");
  Serial.print(PIN_B); Serial.print("="); Serial.print(b); Serial.print(" ");
  Serial.print(PIN_C); Serial.print("="); Serial.println(c);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_A, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  pinMode(PIN_C, OUTPUT);

  delay(300);
  Serial.println("$HELLO esp32-s3");
  emitMode();
  Serial.println("Pin monitor demo started");
}

void loop() {
  static uint8_t step = 0;

  int a = (step == 0) ? 1 : 0;
  int b = (step == 1) ? 1 : 0;
  int c = (step == 2) ? 1 : 0;

  digitalWrite(PIN_A, a);
  digitalWrite(PIN_B, b);
  digitalWrite(PIN_C, c);
  emitState(a, b, c);

  // Normal log line — stays in terminal regardless of "Show pin protocol" setting
  Serial.print("tick step=");
  Serial.println(step);

  step = (step + 1) % 3;
  delay(400);
}
