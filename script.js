// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCnPWR9gN0bcRI4OqcFDMSinBbOjRoY_Zo",
  authDomain: "YOUR_AUTH_DOMAIN", // Optional, but recommended
  databaseURL: "https://digital-scoreboard-mvp-default-rtdb.firebaseio.com/",
  projectId: "YOUR_PROJECT_ID", // Optional, but recommended
  storageBucket: "YOUR_STORAGE_BUCKET", // Optional
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // Optional
  appId: "YOUR_APP_ID" // Optional
};

// --- Initialize Firebase ---
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const gameStateRef = database.ref("gameState");

// --- DOM Elements ---
const body = document.body;
const homeScoreEl = document.getElementById("homeScore");
const awayScoreEl = document.getElementById("awayScore");
const periodEl = document.getElementById("period");
const clockEl = document.getElementById("clock");
const setMinutesInput = document.getElementById("setMinutes");
const setSecondsInput = document.getElementById("setSeconds");
const playPauseButton = document.getElementById("playPause");
// Penalty Elements
const penaltyTeamSelect = document.getElementById("penaltyTeam");
const penaltyPlayerNumInput = document.getElementById("penaltyPlayerNum");
const penaltyMinutesInput = document.getElementById("penaltyMinutes");
const penaltySecondsInput = document.getElementById("penaltySeconds");
const addPenaltyButton = document.getElementById("addPenalty");
const penaltyListEl = document.getElementById("penaltyList");

// --- App State ---
let localGameState = {
    homeScore: 0,
    awayScore: 0,
    period: 1,
    clockTime: 0, // Total seconds for main clock
    isRunning: false,
    penalties: {} // Object to store penalties by unique ID
};
let timerInterval = null;

// --- Utility Functions ---
function formatTime(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function updateMainDisplay(state) {
    homeScoreEl.textContent = state.homeScore;
    awayScoreEl.textContent = state.awayScore;
    periodEl.textContent = state.period;
    clockEl.textContent = formatTime(state.clockTime);
    playPauseButton.textContent = state.isRunning ? "Pause" : "Play";
}

function updatePenaltyDisplay(penalties) {
    penaltyListEl.innerHTML = "<h3>Active Penalties</h3>"; // Clear existing penalties
    if (!penalties || Object.keys(penalties).length === 0) {
        const noPenaltiesMsg = document.createElement("p");
        noPenaltiesMsg.textContent = "No active penalties.";
        noPenaltiesMsg.style.textAlign = "center";
        noPenaltiesMsg.style.color = "#888";
        penaltyListEl.appendChild(noPenaltiesMsg);
        return;
    }

    for (const id in penalties) {
        const penalty = penalties[id];
        const penaltyItem = document.createElement("div");
        penaltyItem.classList.add("penalty-item");
        penaltyItem.innerHTML = `
            <span>${penalty.team}</span>
            <span>#${penalty.playerNum}</span>
            <span class="penalty-time">${formatTime(penalty.remainingTime)}</span>
        `;
        penaltyListEl.appendChild(penaltyItem);
    }
}

// --- Firebase Functions ---
function updateFirebaseState(newState) {
    // Ensure penalties is always an object, even if empty
    if (!newState.penalties) {
        newState.penalties = {};
    }
    gameStateRef.set(newState).catch(error => {
        console.error("Error updating Firebase:", error);
    });
}

// Listen for changes in Firebase
gameStateRef.on("value", (snapshot) => {
    const firebaseState = snapshot.val();
    if (firebaseState) {
        // Ensure penalties object exists
        localGameState = { ...firebaseState, penalties: firebaseState.penalties || {} }; 
        updateMainDisplay(localGameState);
        updatePenaltyDisplay(localGameState.penalties);

        // Handle timer based on Firebase state
        if (localGameState.isRunning && !timerInterval) {
            startTimer();
        } else if (!localGameState.isRunning && timerInterval) {
            stopTimer();
        }
    } else {
        // Initialize Firebase if it's empty
        localGameState = { homeScore: 0, awayScore: 0, period: 1, clockTime: 0, isRunning: false, penalties: {} };
        updateFirebaseState(localGameState);
        updateMainDisplay(localGameState);
        updatePenaltyDisplay(localGameState.penalties);
    }
});

// --- Timer Functions ---
function startTimer() {
    if (timerInterval) return; // Already running
    timerInterval = setInterval(() => {
        let stateChanged = false;

        // Decrement main clock
        if (localGameState.isRunning && localGameState.clockTime > 0) {
            localGameState.clockTime--;
            stateChanged = true;
        } else if (localGameState.isRunning && localGameState.clockTime <= 0) {
            // Main clock reached zero
            localGameState.isRunning = false;
            stateChanged = true;
        }

        // Decrement penalties
        let penaltiesUpdated = false;
        for (const id in localGameState.penalties) {
            if (localGameState.penalties[id].remainingTime > 0) {
                localGameState.penalties[id].remainingTime--;
                penaltiesUpdated = true;
                if (localGameState.penalties[id].remainingTime <= 0) {
                    // Penalty expired, remove it (will be handled by scorekeeper update)
                }
            }
        }
        if (penaltiesUpdated) stateChanged = true;

        // Scorekeeper updates Firebase, Viewers update local display
        if (body.classList.contains("scorekeeper-view")) {
             // Scorekeeper removes expired penalties before saving
            for (const id in localGameState.penalties) {
                if (localGameState.penalties[id].remainingTime <= 0) {
                    delete localGameState.penalties[id];
                }
            }
            if (stateChanged) {
                updateFirebaseState(localGameState);
            }
        } else {
            // Viewers just update display based on local decrement
            // Firebase listener will correct any discrepancies
            if (stateChanged) {
                 updateMainDisplay(localGameState);
                 updatePenaltyDisplay(localGameState.penalties);
            }
        }

        // Stop interval if main clock is no longer running
        if (!localGameState.isRunning) {
            stopTimer();
            // Ensure final state is saved if stopped by clock reaching 0
            if (body.classList.contains("scorekeeper-view") && stateChanged) {
                 updateFirebaseState(localGameState);
            }
        }

    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

// --- Event Listeners (Scorekeeper Controls) ---

// View Selection
document.getElementById("showScorekeeper").addEventListener("click", () => {
    body.classList.add("scorekeeper-view");
    body.classList.remove("viewer-view");
});
document.getElementById("showViewer").addEventListener("click", () => {
    body.classList.remove("scorekeeper-view");
    body.classList.add("viewer-view");
    // Ensure timer stops visually for viewer if they switch while it runs
    if (!localGameState.isRunning) {
        stopTimer();
    }
});

// Score Buttons
document.getElementById("homeIncrease").addEventListener("click", () => {
    localGameState.homeScore++;
    updateFirebaseState(localGameState);
});
document.getElementById("homeDecrease").addEventListener("click", () => {
    if (localGameState.homeScore > 0) {
        localGameState.homeScore--;
        updateFirebaseState(localGameState);
    }
});
document.getElementById("awayIncrease").addEventListener("click", () => {
    localGameState.awayScore++;
    updateFirebaseState(localGameState);
});
document.getElementById("awayDecrease").addEventListener("click", () => {
    if (localGameState.awayScore > 0) {
        localGameState.awayScore--;
        updateFirebaseState(localGameState);
    }
});

// Period Buttons
document.getElementById("periodIncrease").addEventListener("click", () => {
    localGameState.period++;
    updateFirebaseState(localGameState);
});
document.getElementById("periodDecrease").addEventListener("click", () => {
    if (localGameState.period > 1) {
        localGameState.period--;
        updateFirebaseState(localGameState);
    }
});

// Clock Buttons
document.getElementById("setClock").addEventListener("click", () => {
    const minutes = parseInt(setMinutesInput.value) || 0;
    const seconds = parseInt(setSecondsInput.value) || 0;
    localGameState.clockTime = (minutes * 60) + seconds;
    localGameState.isRunning = false; // Stop timer when setting
    stopTimer();
    updateFirebaseState(localGameState);
    setMinutesInput.value = "";
    setSecondsInput.value = "";
});

document.getElementById("playPause").addEventListener("click", () => {
    localGameState.isRunning = !localGameState.isRunning;
    if (localGameState.isRunning) {
        if(localGameState.clockTime > 0) {
             startTimer();
        } else {
             localGameState.isRunning = false; // Can't start if time is 0
        }
    } else {
        stopTimer();
    }
    updateFirebaseState(localGameState);
});

// Penalty Button
addPenaltyButton.addEventListener("click", () => {
    const team = penaltyTeamSelect.value;
    const playerNum = penaltyPlayerNumInput.value;
    const minutes = parseInt(penaltyMinutesInput.value) || 0;
    const seconds = parseInt(penaltySecondsInput.value) || 0;
    const duration = (minutes * 60) + seconds;

    if (!playerNum || duration <= 0) {
        alert("Please enter a valid player number and penalty duration.");
        return;
    }

    const penaltyId = `penalty_${Date.now()}`;
    const newPenalty = {
        id: penaltyId,
        team: team,
        playerNum: playerNum,
        remainingTime: duration
    };

    // Ensure penalties object exists before adding
    if (!localGameState.penalties) {
        localGameState.penalties = {};
    }
    localGameState.penalties[penaltyId] = newPenalty;
    updateFirebaseState(localGameState);

    // Clear inputs
    penaltyPlayerNumInput.value = "";
    penaltyMinutesInput.value = "";
    penaltySecondsInput.value = "";
});


// --- Initial Load ---
// Set default view (e.g., viewer)
body.classList.add("viewer-view");
// Initial display update based on default local state before Firebase loads
updateMainDisplay(localGameState);
updatePenaltyDisplay(localGameState.penalties);

