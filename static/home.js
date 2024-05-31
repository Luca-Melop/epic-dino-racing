function playMusicAndShowContent() {
    document.getElementById('backgroundMusic').play();
    document.getElementById('playMusicContainer').style.display = 'none';
    document.getElementById('mainContent').style.display = 'flex';
}

//add sound to buttons
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
   
    socket.emit("requestHighscores");
 
 
 socket.on('top_scores', function(data) {
     var topScoresList = document.getElementById('top-scores-list');
     // Clear existing list items
     topScoresList.innerHTML = '';
 
     // Loop through the scores data and create list items
     data.topScores.forEach(function(score) {
         var listItem = document.createElement('li');
         listItem.innerHTML = `<strong>${score.name}</strong>: ${score.score} Sekunden`;
         topScoresList.appendChild(listItem);
     });
 });
 
 })



