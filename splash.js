const statusLines = [
  "Initializing export environment...",
  "Loading interface modules...",
  "Checking Python integration...",
  "Preparing ONNX Nova workspace...",
  "Finalizing startup sequence..."
];

const subtitle = document.getElementById("splashSubtitle");

let index = 0;

function rotateStatus() {
  if (!subtitle) {
    return;
  }

  subtitle.classList.remove("status-visible");
  subtitle.classList.add("status-hidden");

  window.setTimeout(() => {
    index = (index + 1) % statusLines.length;
    subtitle.textContent = statusLines[index];
    subtitle.classList.remove("status-hidden");
    subtitle.classList.add("status-visible");
  }, 180);
}

if (subtitle) {
  subtitle.textContent = statusLines[0];
  subtitle.classList.add("status-visible");
  window.setInterval(rotateStatus, 1400);
}
