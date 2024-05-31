function joinShowContent() {
    document.getElementById('selection').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
}

function playMusic() {
    document.getElementById('backgroundMusic').play();
}

// Add sound to buttons
document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll('button, a'); // Selects all buttons and anchor tags
    const clickSound = document.getElementById('clickSound');

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            clickSound.play();
        });
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const socket = io.connect(
        location.protocol + "//" + document.domain + ":" + location.port
    );
    let keysPressed = {};
    let startTime;
    let isGameOver = false;
    const room_id = document.getElementById("room_id").value;
    socket.emit("join_room", { room_id: room_id });

    //controls
    document.addEventListener("keydown", (event) => {
        if (!isGameOver) {
            keysPressed[event.key] = true;
        }
    });

    document.addEventListener("keyup", (event) => {
        if (!isGameOver) {
            keysPressed[event.key] = false;
        }
    });

    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible" && startTime) {
            gameOver("Du bisch usegange :( ");
        }
    });

    const startGameButton = document.getElementById("startGameButton");
    startGameButton.addEventListener("click", startGame);

    function startGame() {
        const room_id = document.getElementById("room_id").value; // Ensure room_id is correctly acquired
        socket.emit("start_game", { room_id: room_id });
        document.getElementById("startGameButton").style.display = "none";
        document.getElementById("selection").style.display = "none";
        document.getElementById("runningSound").play();
        requestAnimationFrame(gameLoop);
    }

    let gameStarted = false;

    document.getElementById('joinForm').addEventListener('submit', function (event) {
        event.preventDefault(); // Prevent form submission
        var playerNameInput = document.getElementById("playerName");
        if (playerNameInput.value.trim()) { // Check if playerName is not empty
            const name = playerNameInput.value;
            const color = document.getElementById("playerColor").value;
            socket.emit("join_room", {
                room_id: room_id,
                name: name,
                color: color,
            });
            document.getElementById("selection").style.display = "none";
        } else {
            alert('Du bruchsch ä Name!');
        }
    });

    let currentPlayerID = "";
    socket.on("join_success", function (data) {
        currentPlayerID = data.playerID;
    });

    socket.on("game_started", () => {
        gameStarted = true;
        startTime = Date.now(); // Initialize start time for the game timer
        requestAnimationFrame(gameLoop); // Start the game loop if not already started
    });

    function updateDinoPosition(id, playerData) {
        let dino = document.getElementById("dino_" + id);
        if (!dino && !gameStarted) {
            const gameArea = document.getElementById("gameArea");
            dino = document.createElement("div");
            dino.className = "dino";
            dino.id = "dino_" + id;
            dino.dataset.color = playerData.color; // Set data-color attribute

            gameArea.appendChild(dino);

            // Create and append the name tag for the new dino
            let nameTag = document.createElement("div");
            nameTag.id = "name_" + id; // Assign an ID to the name tag for future updates
            nameTag.textContent = playerData.name; // Set the player's name
            nameTag.style.textAlign = "center";
            nameTag.style.position = "absolute";
            nameTag.style.width = "100%"; // Ensure the name tag spans the width of the dino div
            nameTag.style.bottom = "-20px"; // Position the name tag below the dino div
            dino.appendChild(nameTag);

            // Start the running animation
            startRunningAnimation(dino);
        } else {
            // Dino already exists, update its position, color, and name
            document.getElementById("name_" + id).textContent = playerData.name;
            dino.dataset.color = playerData.color; // Update data-color attribute
        }

        if (dino.style.backgroundImage !== 'url("/static/assets/dead.png")') {
            // Update the dino position only if it's not dead
            dino.style.left = playerData.x + "px";
            dino.style.top = playerData.y + "px";
            dino.style.transform = `rotate(${playerData.angle}deg)`;

            const hitboxDimensions = {
                width: 19, // Adjust these values as necessary
                height: 65,
                x: (dino.offsetWidth - 19) / 2, // Center horizontally
                y: (dino.offsetHeight - 100) / 2, // a bit at the top, exclude tail
            };
            addOrUpdateHitbox(id, hitboxDimensions);
        }
    }


    let animationIntervals = {};


    function startRunningAnimation(dino) {
        let frame = 1;
        let direction = 1;  // 1 for forward, -1 for backward
        const maxFrame = 6;

        if (animationIntervals[dino.id]) {
            clearInterval(animationIntervals[dino.id]); // Clear existing interval if any
        }

        animationIntervals[dino.id] = setInterval(() => {
            const currentColor = dino.dataset.color;  // Fetch current color directly each time
            dino.style.backgroundImage = `url("/static/assets/dino_${currentColor}/${frame}.png")`;

            frame += direction;
            if (frame > maxFrame || frame < 1) {
                direction *= -1; // Reverse the direction at the bounds
                frame += direction;  // Adjust frame to valid range after boundary hit
            }
        }, 50);  // Update frame every 50 ms
    }



    function addOrUpdateHitbox(dinoId, hitboxDimensions) {
        let hitbox = document.getElementById(`hitbox_${dinoId}`);
        if (!hitbox) {
            // Create the hitbox if it doesn't exist
            hitbox = document.createElement("div");
            hitbox.id = `hitbox_${dinoId}`;
            hitbox.style.position = "absolute";
            hitbox.style.backgroundColor = "rgba(255, 0, 0, 0.0)"; // last number increase for debugging
            document.getElementById(`dino_${dinoId}`).appendChild(hitbox);
        }

        // Update or set the hitbox dimensions and position
        hitbox.style.width = `${hitboxDimensions.width}px`;
        hitbox.style.height = `${hitboxDimensions.height}px`;
        hitbox.style.left = `${hitboxDimensions.x}px`;
        hitbox.style.top = `${hitboxDimensions.y}px`;
    }

    socket.on("new_obstacle", (data) => {
        let obElement = document.createElement("div");
        obElement.className = `obstacle ${data.obstacle.type}`;
        obElement.style.position = "absolute";
        obElement.style.left = `${data.obstacle.x}px`;
        obElement.style.top = `${data.obstacle.y}px`;
        obElement.style.width = `${data.obstacle.width}px`;
        obElement.style.height = `${data.obstacle.height}px`;
        document.getElementById("gameArea").appendChild(obElement);
    });

    socket.on("you_are_creator", () => {
        document.getElementById("startGameButton").style.display = "block"; // Show the start button for the room creator
    });

    socket.on("dino_death", function (data) {
        let dino_id = data.dino_id;
        let dinoElement = document.getElementById(`dino_${dino_id}`);
        if (dinoElement) {
            // Stop the running animation
            if (animationIntervals[dino_id]) {
                clearInterval(animationIntervals[dino_id]);
            }

            // Update the path to your dead dino image
            dinoElement.style.backgroundImage = 'url("/static/assets/dead.png")';

            // Initiate death animation (e.g., falling down)
            let start = null;
            function animateDinoDeath(timeStamp) {
                if (!start) start = timeStamp;
                const deltaTime = (timeStamp - start) / 1000; // Time in seconds

                // Incorporate speedFactor into the velocity calculation
                const movement = speedFactor * pixelsPerSecond * deltaTime;

                // Move dino down
                let currentTop = parseFloat(dinoElement.style.top) || 0;
                dinoElement.style.top = `${currentTop + movement}px`;

                start = timeStamp; // Reset start time for the next frame

                // Continue the animation until the dino is out of view
                if (currentTop < window.innerHeight) {
                    requestAnimationFrame(animateDinoDeath);
                }
            }

            requestAnimationFrame(animateDinoDeath);
        }
    });


    socket.on("remove_dino", function (data) {
        const dinoElement = document.getElementById("dino_" + data.dino_id);
        if (dinoElement) {
            dinoElement.remove(); // Remove the dino element from the game area
        }
    });

    function handleMovement(deltaTime) {
        // Adjust movement commands to use deltaTime
        if (!isGameOver) {
            if (keysPressed["ArrowLeft"]) {
                socket.emit("move", {
                    command: "left",
                    deltaTime: deltaTime,
                    room_id: room_id,
                });
            }
            if (keysPressed["ArrowRight"]) {
                socket.emit("move", {
                    command: "right",
                    deltaTime: deltaTime,
                    room_id: room_id,
                });
            }
        }
    }

    //collision function for Dino/Obstacle collision
    function isColliding(rect1, rect2) {
        return !(
            rect2.left > rect1.right ||
            rect2.right < rect1.left ||
            rect2.top > rect1.bottom ||
            rect2.bottom < rect1.top
        );
    }

    function checkCollisions() {
        const players = document.querySelectorAll(".dino");
        players.forEach((player) => {
            const playerID = player.id.replace("dino_", "");

            const hitbox = player.querySelector("div[id^='hitbox_']"); // Find the hitbox within the dino
            if (hitbox) {
                const hitboxRect = hitbox.getBoundingClientRect();

                document
                    .querySelectorAll(".obstacle")
                    .forEach((obstacle) => {
                        const obstacleRect = obstacle.getBoundingClientRect();

                        if (
                            isColliding(hitboxRect, obstacleRect) &&
                            playerID === currentPlayerID && !isGameOver
                        ) {
                            if (obstacle.classList.contains("ice")) {
                                // Emit event to handle ice collision
                                document.getElementById("mudSound").play();
                                socket.emit("ice_collision", { room_id: room_id, player_id: playerID });
                            } else {
                                // Handle collision with other obstacles
                                gameOver("Dead!"); // Handle collision
                                isGameOver = true;
                            }
                        }
                    });
            }
        });
    }

    function gameOver(collisionMessage) {
        console.log("game over");
        const roomId = document.getElementById("room_id").value;
        socket.emit("notify_dino_death", { room_id: roomId });
        // Calculate elapsed time in seconds
        const endTime = Date.now();
        if (!startTime) startTime = endTime;
        const timeSurvived = ((endTime - startTime) / 1000).toFixed(2); // Rounded to two decimal places for precision
        const name = document.getElementById("playerName").value;
        console.log(timeSurvived, name)
        socket.emit("score", { score: timeSurvived, name: name });
        // Update the game over message to include the time survived
        document.getElementById("gameOverMessage").textContent = `${collisionMessage} Dein Dino überlebte: ${timeSurvived} Sekunden.`;
        document.getElementById("gameOverOverlay").style.display = "flex";
        document.getElementById("runningSound").pause(); // Stop the game sound
        document.getElementById("deathSound").play();
    }

    let lastFrameTime = 0; // Initialize last frame time for deltaTime calculation
    const pixelsPerSecond = 200; // Speed of the background and obstacles
    let speedFactor = 1; // factor so that game gets increasingly faster

    setInterval(function () {
        if (gameStarted) {
            speedFactor += 0.1; // Increase the factor by 0.1
        }
    }, 5000); // milliseconds

    function moveBackgroundAndObstacles(deltaTime) {
        const movement = speedFactor * pixelsPerSecond * deltaTime; // Movement in pixels

        // Update background position
        let backgroundPositionY =
            parseFloat(document.getElementById("gameArea").style.backgroundPositionY) || 0;
        backgroundPositionY += movement;
        document.getElementById("gameArea").style.backgroundPositionY = `${backgroundPositionY}px`;

        // Move obstacles
        document.querySelectorAll(".obstacle").forEach((obstacle) => {
            let currentTop = parseFloat(obstacle.style.top) || 0;
            obstacle.style.top = `${currentTop + movement}px`;

            if (currentTop > 600) {
                // Remove obstacle if it moves past the game area
                obstacle.remove();
            }
        });
    }

    function gameLoop(timestamp) {
        if (!lastFrameTime) lastFrameTime = timestamp;
        const deltaTime = (timestamp - lastFrameTime) / 1000; // deltaTime in seconds
        lastFrameTime = timestamp;

        handleMovement(deltaTime);
        moveBackgroundAndObstacles(deltaTime);

        if (!isGameOver) {
            checkCollisions(); // Only check collisions if game is not over
        }

        requestAnimationFrame(gameLoop); // Always request the next frame
    }

    socket.on("all_players", (players) => {
        Object.entries(players).forEach(([id, playerData]) => {
            updateDinoPosition(id, playerData);
        });
    });

    socket.on("ice_collision", function (data) {
        const room_id = document.getElementById("room_id").value;
        const player_id = data.player_id;
        socket.emit("ice_collision", { room_id: room_id, player_id: player_id });
    });

    async function generateSHA256(data) {
        const msgBuffer = new TextEncoder().encode(data); // Encode data as (utf-8) Uint8Array
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer); // Hash the message
        const hashArray = Array.from(new Uint8Array(hashBuffer)); // Convert buffer to byte array
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // Convert bytes to hex string
        return hashHex;
    }

    async function fetchJSFileContent(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    }

    setInterval(async () => {
        try {
            const jsFilePath = '/static/game.js'; // URL of the JS file you want to hash
            const fileContent = await fetchJSFileContent(jsFilePath);
            const dataHash = await generateSHA256(fileContent);
            console.log(dataHash);
            // Assuming you're using Socket.IO:
            socket.emit("validate_hash", { hash: dataHash });
        } catch (error) {
            console.error('Error fetching or hashing the JS file:', error);
        }
    }, 3000);

    //hash validation
    socket.on("cheater", () => {
        gameOver("Hör uf cheate!");
    });

    socket.on('game_in_progress', function (data) {
        document.getElementById('joinForm').style.display = 'none'; // Hide the join game form
        document.getElementById('gameInProgressMessage').style.display = 'block'; // Show the game in progress message
    });

});
