import eventlet 
eventlet.monkey_patch() #for obstacle generation
from flask import Flask, request, render_template, redirect, url_for
from flask_socketio import SocketIO, emit, join_room
import time
import uuid
import random
from flask_sqlalchemy import SQLAlchemy
obstacles = {}  # Dictionary to keep track of obstacles in each room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'M5JRVA*E#naHQ&C5ZuyJKCvZccxZfYcCWC!*XRRMvZaR#j8UeDD!RzuegA5o'

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///scores.db' #database
db = SQLAlchemy(app)

socketio = SocketIO(app)
players = {}
player_last_active = {}
cleanup_lock = eventlet.semaphore.Semaphore(1)
rooms = {}
expected_hash_js = "599db3771961597d29f7dd7fa0e27cbfd057fc33a22a97c5e7561ebe4df14c55"
cheatPrevention = 0 #to toggle cheat prevention off to develp


class Score(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50))
    score = db.Column(db.Integer)

    def __repr__(self): #used for debugging/printing
        return f'<Score {self.name}: {self.score}>'


@app.route('/')
def index():
    return render_template('home.html')


#anti cheat
@socketio.on('validate_hash')
def handle_validate_hash(data):
    sid = request.sid
    received_hash = data.get('hash')
    print(received_hash)
    if received_hash != expected_hash_js and cheatPrevention:
        emit('cheater', {'message': 'Invalid hash detected.'}, room=sid)

@socketio.on('requestHighscores')
def highscores():
    sid = request.sid
    #highscores
    top_players = Score.query.order_by(Score.score.desc()).limit(5).all()
    top_scores_list = [{'name': player.name, 'score': player.score} for player in top_players]
    emit('top_scores', {'topScores': top_scores_list}, room=sid)


@app.route('/create_room', methods=['POST'])
def create_room():
    room_id = str(uuid.uuid4())
    # Include a 'creator' field and a 'game_started' flag
    rooms[room_id] = {"players": {}, "creator": None, "game_started": False}
    return redirect(url_for('game_room', room_id=room_id))


@app.route('/game/<room_id>')
def game_room(room_id):
    if room_id in rooms:
        return render_template('game.html', room_id=room_id)
    else:
        return "Argh, dä Ruum existiert nid", 404


@socketio.on('connect')
def handle_connect():
    print(f"Player connected: {request.sid}")

@socketio.on('join_room')
def on_join(data):
    room_id = data['room_id']
    if room_id in rooms:
        if rooms[room_id]['game_started']:
            emit('game_in_progress', {'message': 'Game has already started. You can only watch.'}, room=request.sid)
            return
        else:
            join_room(room_id)
            player_id = request.sid
            # Extract name and color from the incoming data
            name = data.get('name', 'Anonymous')[:20]  # Default name if not provided, max 20 chars
            color = data.get('color', 'green')  # Default color if not provided
            
            # Update the player entry to include name and color
            rooms[room_id]['players'][player_id] = {
                'x': BOUNDARIES['right'] / 2, 'y': BOUNDARIES['bottom'] - 170,
                'angle': 0, 'speed': 1, 'start_time': time.time(),
                'name': name, 'color': color  # Include the name and color
            }

            # Evenly distribute players along the x-axis
            total_players = len(rooms[room_id]['players'])
            distance_between_players = BOUNDARIES['right'] / total_players
            
            for index, (pid, player) in enumerate(rooms[room_id]['players'].items()):
                player['x'] = distance_between_players * (index + 0.5)  # Center each player in their segment

            # Determine if the joining player is the room creator
            if rooms[room_id].get('creator') is None:
                rooms[room_id]['creator'] = player_id
                emit('you_are_creator', {}, room=player_id)  # Notify this player they are the creator
            print(rooms)
            # Announce the join to the room and broadcast the updated players list
            emit('join_success', {'playerID': player_id}, room=player_id)
            emit('all_players', rooms[room_id]['players'], room=room_id, broadcast=True)



@socketio.on('start_game')
def handle_start_game(data):
    room_id = data['room_id']
    if room_id in rooms and request.sid == rooms[room_id]['creator']:
        rooms[room_id]['game_started'] = True
        emit('game_started', room=room_id, broadcast=True)
        start_generating_obstacles(room_id) 


@socketio.on('disconnect')
def handle_disconnect():
    print(f"Player disconnected: {request.sid}")
    for room_id, room in rooms.items():
        if request.sid in room['players']:
            emit('remove_dino', {'dino_id': request.sid}, room=room_id, broadcast=True, include_self=False)   
            del room['players'][request.sid]


             # Check if the room is now empty
            if not room['players']:  # If no players are left in the room
                with cleanup_lock:  # Use a semaphore to prevent race conditions
                    if not room['players']:  # Double-check the condition to ensure thread safety
                        del rooms[room_id]  # Delete the room if it's empty
                        print(f"Room {room_id} deleted because it's empty.")
            break



@socketio.on('score')
def handle_score(message):
    name = message['name']
    score = message['score']
    new_score = Score(name=name, score=score)
    db.session.add(new_score) #add to database
    db.session.commit()
    emit('score_response', {'message': 'Score saved successfully'})



#boundaries of the play area (e.g., top, bottom, left, right)
BOUNDARIES = {
    'left': 0,
    'right': 770, 
    'top': 0,
    'bottom': 600, 
}


MAZE_OBSTACLES = [

]; #stones


def is_collision_free(x, y, width=50, height=30):
    """Check if the new position is free of collisions with boundaries and obstacles."""
    if not (BOUNDARIES['left'] <= x <= BOUNDARIES['right'] - width and
            BOUNDARIES['top'] <= y <= BOUNDARIES['bottom'] - height):
        return False  # Collision with outer boundaries
    
    for obstacle in MAZE_OBSTACLES:
        # Check collision with each obstacle
        if not (x + width < obstacle['x'] or x > obstacle['x'] + obstacle['width'] or
                y + height < obstacle['y'] or y > obstacle['y'] + obstacle['height']):
            return False  # Collision detected with an obstacle
    
    return True  # No collision detected


@socketio.on('move')
def handle_move(data):
    room_id = data['room_id']
    if room_id in rooms and rooms[room_id]['game_started']:
        player_id = request.sid
        command = data['command']
        delta_time = data.get('deltaTime', 0.016)  # Default to 60 FPS equivalent if not provided
        player = rooms[room_id]['players'].get(player_id)

        if player is None:
            return

        # Use the current speed from the player's state
        movement_speed = player['speed'] * 320
        movement_distance = movement_speed * delta_time

        if command == 'left':
            new_x = max(player['x'] - movement_distance, BOUNDARIES['left'])
            player['x'] = new_x
        elif command == 'right':
            new_x = min(player['x'] + movement_distance, BOUNDARIES['right'])
            player['x'] = new_x

        emit('all_players', {pid: pdata for pid, pdata in rooms[room_id]['players'].items()}, room=room_id)



def start_generating_obstacles(room_id):
    def generate_obstacles_for_room():
        sleep_time = 0.8  # Initial sleep time
        min_sleep_time = 0.14  # Minimum sleep time to prevent too frequent generation
        decrease_factor = 0.0045  # Amount by which to decrease sleep time each iteration
        while rooms[room_id]['game_started']:
            size = random.randint(50, 100)
            obstacle = {'x': random.randint(0, 750), 'y': -100, 'width': size, 'height': size}
            obstacle = {'x': random.randint(0, 750), 'y': -100, 'width': size, 'height': size, 'type': 'ice'} if random.random() < 0.1 else {'x': random.randint(0, 750), 'y': -100, 'width': size, 'height': size}
            socketio.emit('new_obstacle', {'obstacle': obstacle}, room=room_id)
            socketio.sleep(sleep_time)
            sleep_time = max(min_sleep_time, sleep_time - decrease_factor)  # Decrease sleep time but not below minimum
            print(sleep_time)

    if room_id in rooms:
        socketio.start_background_task(generate_obstacles_for_room)

@socketio.on("ice_collision")
def handle_ice_collision(data):
    room_id = data['room_id']
    player_id = data['player_id']
    # Reduce the player's speed
    rooms[room_id]['players'][player_id]['speed'] = 0.35 #speed multiplikator
    # Send updated player data to frontend
    socketio.emit("all_players", rooms[room_id]['players'], room=room_id)
    # Revert player's speed
    def revert_speed():
        rooms[room_id]['players'][player_id]['speed'] = 1
        # Send updated player data to frontend
        socketio.emit("all_players", rooms[room_id]['players'], room=room_id)
    socketio.sleep(5)  # Sleep for 5 seconds
    revert_speed()



@socketio.on('notify_dino_death')
def on_notify_dino_death(data):
    room_id = data['room_id']
    dino_id = request.sid

    if room_id in rooms and dino_id in rooms[room_id]['players']:
        del rooms[room_id]['players'][dino_id]  # Remove the dino from the room's player list

        if not rooms[room_id]['players']:
            del rooms[room_id]  #remove the room if empty
            print(f"Room {room_id} deleted because it's empty.")
            
    emit('dino_death', {'dino_id': dino_id}, room=room_id, broadcast=True)


with app.app_context():
    db.create_all()

if __name__ == '__main__':
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True, host='0.0.0.0', port=5000)