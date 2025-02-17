import pygame
import random
from enum import Enum
from typing import Dict, Set, Tuple, Optional, List
from math import sqrt, cos, sin, atan2, pi
from dataclasses import dataclass
from time import time

@dataclass
class Ability:
    name: str
    damage: int
    cooldown: float
    range: int
    last_used: float = 0
    effect_duration: float = 0.2  # Duration to show the visual effect
    
    def is_ready(self) -> bool:
        return time() - self.last_used >= self.cooldown
    
    def use(self):
        self.last_used = time()
        self.effect_start = time()  # Track when effect starts
        
    def should_show_effect(self) -> bool:
        return time() - self.last_used < self.effect_duration

class Projectile:
    def __init__(self, x: int, y: int, direction: float, speed: int, damage: int, range: int):
        self.x = x
        self.y = y
        self.direction = direction
        self.speed = speed
        self.damage = damage
        self.range = range
        self.distance_traveled = 0
        self.active = True
        
    def update(self):
        dx = cos(self.direction) * self.speed
        dy = sin(self.direction) * self.speed
        self.x += dx
        self.y += dy
        self.distance_traveled += sqrt(dx * dx + dy * dy)
        
        if self.distance_traveled >= self.range:
            self.active = False

class Player:  
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y
        self.health = 200
        self.speed = 5
        self.direction = 0
        self.sprite = None
        self.size = 24

        # add multishot flag
        self.has_multi_shot = False
        
        # Define abilities
        self.abilities = {
            "aoe": Ability("Circle of Damage", 20, 3.0, 150),
            "cone": Ability("Forward Slash", 30, 1.5, 150),
            "projectile": Ability("Energy Bolt", 25, 2.0, 500)
        }
        
        self.projectiles: List[Projectile] = []
        
    def use_ability(self, ability_name: str, enemies: List['Enemy']) -> None:
        ability = self.abilities[ability_name]
        if not ability.is_ready():
            return
            
        if ability_name == "aoe":
            # Circle of Damage
            for enemy in enemies:
                dist = sqrt((enemy.x - self.x)**2 + (enemy.y - self.y)**2)
                if dist <= ability.range:
                    enemy.take_damage(ability.damage)
                    
        elif ability_name == "cone":
            # Forward Slash in 90-degree cone
            cone_angle = pi / 2  # 90 degrees in radians
            for enemy in enemies:
                dx = enemy.x - self.x
                dy = enemy.y - self.y
                dist = sqrt(dx * dx + dy * dy)
                if dist <= ability.range:
                    enemy_angle = atan2(dy, dx)
                    angle_diff = abs(enemy_angle - self.direction)
                    while angle_diff > pi:
                        angle_diff -= 2 * pi
                    if abs(angle_diff) <= cone_angle / 2:
                        enemy.take_damage(ability.damage)
                        
        elif ability_name == "projectile":
            if self.has_multi_shot:
                # Fire in four directions: N, S, E, W
                directions = [0, pi/2, pi, 3*pi/2]  # East, South, West, North
                for direction in directions:
                    projectile = Projectile(
                        self.x + cos(direction) * self.size,
                        self.y + sin(direction) * self.size,
                        direction,
                        10,
                        ability.damage,
                        ability.range
                    )
                    self.projectiles.append(projectile)
            else:
                # Original single projectile logic
                projectile = Projectile(
                    self.x + cos(self.direction) * self.size,
                    self.y + sin(self.direction) * self.size,
                    self.direction,
                    10,
                    ability.damage,
                    ability.range
                )
                self.projectiles.append(projectile)
                
        ability.use()

    def move(self, dx: int, dy: int, walls: List[pygame.Rect]):
        new_x = self.x + dx * self.speed
        new_y = self.y + dy * self.speed
        player_rect = pygame.Rect(new_x, new_y, self.size, self.size)
        
        if not any(player_rect.colliderect(wall) for wall in walls):
            self.x = new_x
            self.y = new_y
            
        # Update direction based on movement
        if dx != 0 or dy != 0:
            self.direction = atan2(dy, dx)
                
    def update_projectiles(self, enemies: List['Enemy'], walls: List[pygame.Rect]):
        for projectile in self.projectiles[:]:
            projectile.update()
            
            # Check wall collisions
            proj_rect = pygame.Rect(projectile.x - 5, projectile.y - 5, 10, 10)
            if any(proj_rect.colliderect(wall) for wall in walls):
                projectile.active = False
                
            # Check enemy collisions
            for enemy in enemies:
                enemy_rect = pygame.Rect(enemy.x - enemy.size/2, 
                                       enemy.y - enemy.size/2, 
                                       enemy.size, enemy.size)
                if proj_rect.colliderect(enemy_rect):
                    enemy.take_damage(projectile.damage)
                    projectile.active = False
                    break
                    
        # Remove inactive projectiles
        self.projectiles = [p for p in self.projectiles if p.active]

class PowerUpType(Enum):
    HEALTH = "health"
    DAMAGE = "damage"
    SPEED = "speed"
    COOLDOWN = "cooldown"
    MULTI_SHOT = "multi_shot"

class PowerUp:
    def __init__(self, x: int, y: int, power_up_type: PowerUpType):
        self.x = x
        self.y = y
        self.type = power_up_type
        self.size = 20
        self.collected = False
        self.pulse_time = 0
        self.pulse_speed = 2
        
    def update(self):
        # Create a pulsing effect
        self.pulse_time += 0.05
        
    def get_display_size(self) -> float:
        return self.size + sin(self.pulse_time * self.pulse_speed) * 4
        
    def apply_effect(self, player: Player):
        if self.type == PowerUpType.HEALTH:
            player.health = min(player.health + 50, 200)  # change '200' to MAX_HEALTH
        elif self.type == PowerUpType.DAMAGE:
            # Increase all ability damages by 5
            for ability in player.abilities.values():
                ability.damage += 5
        elif self.type == PowerUpType.SPEED:
            player.speed += 1
        elif self.type == PowerUpType.COOLDOWN:
            # Reduce all ability cooldowns by 10%
            for ability in player.abilities.values():
                ability.cooldown *= 0.9
        elif self.type == PowerUpType.MULTI_SHOT:
            player.has_multi_shot = True
            

class Enemy:
    def __init__(self, x: int, y: int, is_boss: bool = False):
        self.x = x
        self.y = y
        self.health = 50
        self.max_health = 50
        self.speed = 2
        self.damage = 5
        self.size = 24
        self.attack_cooldown = 1.0
        self.last_attack = 0
        self.is_boss = is_boss
        
    def take_damage(self, amount: int):
        self.health -= amount
        
    def is_dead(self) -> bool:
        return self.health <= 0
        
    def move_toward_player(self, player: Player, walls: List[pygame.Rect]):
        dx = player.x - self.x
        dy = player.y - self.y
        distance = sqrt(dx * dx + dy * dy)
        
        if distance > 0:
            dx = dx / distance * self.speed
            dy = dy / distance * self.speed
            
            new_x = self.x + dx
            new_y = self.y + dy
            enemy_rect = pygame.Rect(new_x - self.size/2, new_y - self.size/2, 
                                   self.size, self.size)
            
            if not any(enemy_rect.colliderect(wall) for wall in walls):
                self.x = new_x
                self.y = new_y
                
    def attack_player(self, player: Player) -> bool:
        if time() - self.last_attack >= self.attack_cooldown:
            distance = sqrt((player.x - self.x)**2 + (player.y - self.y)**2)
            if distance < self.size + player.size:
                player.health -= self.damage
                self.last_attack = time()
                return True
        return False

class Direction(Enum):
    NORTH = (0, -1)
    SOUTH = (0, 1)
    EAST = (1, 0)
    WEST = (-1, 0)

class Camera:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.x = 0
        self.y = 0
        
    def update(self, target_x: int, target_y: int, room_width: int, room_height: int):
        # Center the camera on the target (player)
        self.x = target_x - self.width // 2
        self.y = target_y - self.height // 2
        
        # Keep the camera within room bounds
        self.x = max(0, min(self.x, room_width - self.width))
        self.y = max(0, min(self.y, room_height - self.height))
        
    def apply(self, entity_x: int, entity_y: int) -> Tuple[int, int]:
        # Transform entity coordinates to screen coordinates
        return entity_x - self.x, entity_y - self.y

class RoomType(Enum):
    START = "start"
    NORMAL = "normal"
    BOSS = "boss"
    TREASURE = "treasure"

class Room:
    def __init__(self, x: int, y: int, room_type: RoomType = RoomType.NORMAL):
        self.grid_x = x
        self.grid_y = y
        self.room_type = room_type
        self.width = 1200
        self.height = 1200
        self.walls: List[pygame.Rect] = []
        self.enemies: List[Enemy] = []
        self.doors: Dict[Direction, bool] = {
            Direction.NORTH: False,
            Direction.SOUTH: False,
            Direction.EAST: False,
            Direction.WEST: False
        }
        self.explored = False
        self.power_ups: List[PowerUp] = []
        self.boss_defeated = False
        self.generate_layout()
        self.spawn_enemies()
        
    def spawn_enemies(self):
        if self.room_type == RoomType.BOSS:
            # Spawn boss (stronger enemy)
            boss = Enemy(self.width // 2, self.height // 2, is_boss=True)
            boss.health = 200
            boss.max_health = 200
            boss.damage = 15
            boss.size = 48
            self.enemies = [boss]
            print(f"Spawned boss: {boss.is_boss}")  # Debug print
        elif self.room_type == RoomType.NORMAL:
            # Spawn 2-4 regular enemies
            num_enemies = random.randint(2, 4)
            self.enemies = []
            for _ in range(num_enemies):
                x = random.randint(50, self.width - 50)
                y = random.randint(50, self.height - 50)
                self.enemies.append(Enemy(x, y))

    def generate_layout(self):
        # Clear existing walls
        self.walls = []
        
        # Add walls with gaps for doors
        wall_thickness = 20
        door_width = 80
        
        # Top wall with potential door
        if not self.doors[Direction.NORTH]:
            self.walls.extend([
                pygame.Rect(0, 0, self.width // 2 - door_width // 2, wall_thickness),
                pygame.Rect(self.width // 2 + door_width // 2, 0, 
                        self.width // 2 - door_width // 2, wall_thickness)
            ])
        
        # Bottom wall with potential door
        if not self.doors[Direction.SOUTH]:
            self.walls.extend([
                pygame.Rect(0, self.height - wall_thickness, 
                        self.width // 2 - door_width // 2, wall_thickness),
                pygame.Rect(self.width // 2 + door_width // 2, 
                        self.height - wall_thickness,
                        self.width // 2 - door_width // 2, wall_thickness)
            ])
        
        # Left wall with potential door
        if not self.doors[Direction.WEST]:
            self.walls.extend([
                pygame.Rect(0, 0, wall_thickness, self.height // 2 - door_width // 2),
                pygame.Rect(0, self.height // 2 + door_width // 2,
                        wall_thickness, self.height // 2 - door_width // 2)
            ])
        
        # Right wall with potential door
        if not self.doors[Direction.EAST]:
            self.walls.extend([
                pygame.Rect(self.width - wall_thickness, 0,
                        wall_thickness, self.height // 2 - door_width // 2),
                pygame.Rect(self.width - wall_thickness, 
                        self.height // 2 + door_width // 2,
                        wall_thickness, self.height // 2 - door_width // 2)
            ])
            
        # Add more random obstacles for larger rooms
        if self.room_type not in [RoomType.BOSS, RoomType.TREASURE]:
            num_obstacles = 15  # More obstacles for larger rooms
            for _ in range(num_obstacles):
                x = random.randint(wall_thickness + 50, self.width - wall_thickness - 100)
                y = random.randint(wall_thickness + 50, self.height - wall_thickness - 100)
                obstacle_width = random.randint(30, 80)
                obstacle_height = random.randint(30, 80)
                self.walls.append(pygame.Rect(x, y, obstacle_width, obstacle_height))

class DungeonMap:
    def __init__(self, size: int = 5, num_floors: int = 3):
        self.size = size
        self.rooms: Dict[Tuple[int, int], Room] = {}
        self.current_room_pos = (0, 0)
        self.current_floor = 1
        self.num_floors = num_floors
        self.floor_completed = False
        self.generate_dungeon()

    def is_floor_complete(self) -> bool:
        # Check if all enemies on the current floor are defeated
        for room in self.rooms.values():
            if room.enemies:
                return False
        return True
        
    def spawn_staircase(self):
        # Find boss room and spawn staircase
        for pos, room in self.rooms.items():
            if room.room_type == RoomType.BOSS and room.boss_defeated:
                # Create a special door/staircase in the boss room
                self.floor_completed = True
                print(f"Staircase spawned at position {pos}")
                return pos
        return None
        
    def generate_dungeon(self):
        # Start with a room at (0,0)
        self.rooms[(0, 0)] = Room(0, 0, RoomType.START)
        
        # Generate connected rooms
        positions_to_process = [(0, 0)]
        connected_positions = set([(0, 0)])
        
        while positions_to_process and len(self.rooms) < self.size:
            current_pos = positions_to_process.pop(0)
            
            for direction in Direction:
                new_pos = (current_pos[0] + direction.value[0],
                          current_pos[1] + direction.value[1])
                
                if (new_pos not in connected_positions and 
                    len(self.rooms) < self.size and
                    random.random() < 0.7):  # 70% chance to create a room
                    
                    # Create new room
                    room_type = RoomType.NORMAL
                    if len(self.rooms) == self.size - 1:
                        room_type = RoomType.BOSS
                    elif random.random() < 0.1:
                        room_type = RoomType.TREASURE
                        
                    new_room = Room(new_pos[0], new_pos[1], room_type)
                    self.rooms[new_pos] = new_room
                    
                    # Connect rooms with doors
                    self.rooms[current_pos].doors[direction] = True
                    new_room.doors[self._opposite_direction(direction)] = True
                    
                    connected_positions.add(new_pos)
                    positions_to_process.append(new_pos)

    def _opposite_direction(self, direction: Direction) -> Direction:
        opposites = {
            Direction.NORTH: Direction.SOUTH,
            Direction.SOUTH: Direction.NORTH,
            Direction.EAST: Direction.WEST,
            Direction.WEST: Direction.EAST
        }
        return opposites[direction]

class Minimap:
    def __init__(self, dungeon_map: DungeonMap):
        self.dungeon_map = dungeon_map
        self.cell_size = 20
        self.padding = 10
        self.surface = pygame.Surface((200, 200))
        
    def draw(self, screen: pygame.Surface):
        self.surface.fill((0, 0, 0))
        self.surface.set_alpha(128)
        
        # Draw each explored room
        for pos, room in self.dungeon_map.rooms.items():
            if room.explored:
                x = pos[0] * (self.cell_size + self.padding) + 100
                y = pos[1] * (self.cell_size + self.padding) + 100
                
                # Draw room
                color = self._get_room_color(room)
                pygame.draw.rect(self.surface, color,
                               (x, y, self.cell_size, self.cell_size))
                
                # Draw doors
                for direction, has_door in room.doors.items():
                    if has_door:
                        door_pos = self._get_door_position(x, y, direction)
                        pygame.draw.rect(self.surface, (200, 200, 200),
                                       door_pos)
        
        # Draw current room indicator
        current_x = self.dungeon_map.current_room_pos[0] * (self.cell_size + self.padding) + 100
        current_y = self.dungeon_map.current_room_pos[1] * (self.cell_size + self.padding) + 100
        pygame.draw.rect(self.surface, (255, 255, 255),
                        (current_x, current_y, self.cell_size, self.cell_size), 2)
        
        # Draw minimap in top-right corner
        screen.blit(self.surface, (screen.get_width() - 220, 20))
    
    def _get_room_color(self, room: Room) -> Tuple[int, int, int]:
        colors = {
            RoomType.START: (0, 255, 0),
            RoomType.NORMAL: (100, 100, 100),
            RoomType.BOSS: (255, 0, 0),
            RoomType.TREASURE: (255, 215, 0)
        }
        return colors[room.room_type]
    
    def _get_door_position(self, x: int, y: int, 
                          direction: Direction) -> pygame.Rect:
        door_size = 4
        if direction == Direction.NORTH:
            return pygame.Rect(x + self.cell_size//2 - door_size//2,
                             y - door_size//2,
                             door_size, door_size)
        elif direction == Direction.SOUTH:
            return pygame.Rect(x + self.cell_size//2 - door_size//2,
                             y + self.cell_size - door_size//2,
                             door_size, door_size)
        elif direction == Direction.EAST:
            return pygame.Rect(x + self.cell_size - door_size//2,
                             y + self.cell_size//2 - door_size//2,
                             door_size, door_size)
        else:  # WEST
            return pygame.Rect(x - door_size//2,
                             y + self.cell_size//2 - door_size//2,
                             door_size, door_size)

class Game:
    def __init__(self):
        pygame.init()
        self.width = 800
        self.height = 600
        self.screen = pygame.display.set_mode((self.width, self.height))
        self.clock = pygame.time.Clock()
        self.running = True
        
        self.dungeon = DungeonMap(size=8)  # Create 8 rooms
        self.minimap = Minimap(self.dungeon)
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        safe_x, safe_y = self._find_safe_position(current_room, self.width // 2, self.height // 2)
        self.player = Player(safe_x, safe_y)
        
        # Add camera
        self.camera = Camera(self.width, self.height)

        # Mark starting room as explored
        self.dungeon.rooms[self.dungeon.current_room_pos].explored = True
    
    def _check_room_transition(self):
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        player_rect = pygame.Rect(self.player.x, self.player.y, 32, 32)
        
        # Define door areas for a larger room
        door_areas = {
            Direction.NORTH: pygame.Rect(current_room.width // 2 - 40, 0, 80, 20),
            Direction.SOUTH: pygame.Rect(current_room.width // 2 - 40, current_room.height - 20, 80, 20),
            Direction.WEST: pygame.Rect(0, current_room.height // 2 - 40, 20, 80),
            Direction.EAST: pygame.Rect(current_room.width - 20, current_room.height // 2 - 40, 20, 80)
        }
        
        # Check collisions with door areas
        for direction, door_area in door_areas.items():
            if (current_room.doors[direction] and 
                player_rect.colliderect(door_area)):
                self._transition_room(direction)
                return
    
    def _find_safe_position(self, room: Room, base_x: int, base_y: int) -> Tuple[int, int]:
        """Find a safe position near the given coordinates that doesn't collide with walls."""
        for offset in range(0, 200, 20):
            for dx in [-offset, offset]:
                for dy in [-offset, offset]:
                    test_x = base_x + dx
                    test_y = base_y + dy
                    
                    test_rect = pygame.Rect(test_x, test_y, 32, 32)
                    
                    if not any(test_rect.colliderect(wall) for wall in room.walls):
                        if (20 < test_x < room.width - 52 and 
                            20 < test_y < room.height - 52):
                            return test_x, test_y
                            
        return room.width // 2, room.height // 2

    def _transition_room(self, direction: Direction):
        new_pos = (
            self.dungeon.current_room_pos[0] + direction.value[0],
            self.dungeon.current_room_pos[1] + direction.value[1]
        )
        
        if new_pos in self.dungeon.rooms:
            self.dungeon.current_room_pos = new_pos
            new_room = self.dungeon.rooms[new_pos]
            new_room.explored = True
            
            # Calculate spawn position based on room size
            if direction == Direction.NORTH:
                base_x = new_room.width // 2
                base_y = new_room.height - 100
            elif direction == Direction.SOUTH:
                base_x = new_room.width // 2
                base_y = 100
            elif direction == Direction.WEST:
                base_x = new_room.width - 100
                base_y = new_room.height // 2
            else:  # EAST
                base_x = 100
                base_y = new_room.height // 2
            
            safe_x, safe_y = self._find_safe_position(new_room, base_x, base_y)
            self.player.x = safe_x
            self.player.y = safe_y

    def handle_input(self):
        keys = pygame.key.get_pressed()
        # mouse_x, mouse_y = pygame.mouse.get_pos()
        
        # Movement
        dx = keys[pygame.K_RIGHT] - keys[pygame.K_LEFT]
        dy = keys[pygame.K_DOWN] - keys[pygame.K_UP]
        self.player.move(dx, dy, self.dungeon.rooms[self.dungeon.current_room_pos].walls)
        
        # # Update player direction based on mouse position
        # if dx == 0 and dy == 0:  # Only update direction with mouse if not moving
        #     dx = mouse_x - self.player.x
        #     dy = mouse_y - self.player.y
        #     self.player.direction = atan2(dy, dx)
        
        # Abilities
        if keys[pygame.K_1]:
            self.player.use_ability("aoe", 
                self.dungeon.rooms[self.dungeon.current_room_pos].enemies)
        if keys[pygame.K_2]:
            self.player.use_ability("cone", 
                self.dungeon.rooms[self.dungeon.current_room_pos].enemies)
        if keys[pygame.K_3]:
            self.player.use_ability("projectile", 
                self.dungeon.rooms[self.dungeon.current_room_pos].enemies)
        
        # Room transitions
        self._check_room_transition()

    def _check_boss_defeat(self):
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        
        # Check if this room had a boss that was defeated
        if current_room.room_type == RoomType.BOSS and not current_room.boss_defeated:
            current_room.boss_defeated = True
            print("Boss defeated! Spawning power-up")
            
            # Spawn a power-up
            power_up_type = random.choice(list(PowerUpType))
            # power_up_type = PowerUpType.MULTI_SHOT
            power_up = PowerUp(current_room.width // 2, current_room.height // 2, power_up_type)
            current_room.power_ups.append(power_up)
            
            # Check if the floor is complete
            if self.dungeon.is_floor_complete():
                print("Floor complete! Spawning staircase")
                self.dungeon.spawn_staircase()

    def _check_powerup_collection(self):
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        player_rect = pygame.Rect(self.player.x - self.player.size/2, 
                                self.player.y - self.player.size/2,
                                self.player.size, self.player.size)
                                
        for power_up in current_room.power_ups[:]:
            if not power_up.collected:
                power_up_rect = pygame.Rect(power_up.x - power_up.size/2,
                                        power_up.y - power_up.size/2,
                                        power_up.size, power_up.size)
                if player_rect.colliderect(power_up_rect):
                    power_up.apply_effect(self.player)
                    power_up.collected = True
                    current_room.power_ups.remove(power_up)

    def _check_staircase(self):
        if self.dungeon.floor_completed:
            current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
            if current_room.room_type == RoomType.BOSS and current_room.boss_defeated:
                player_rect = pygame.Rect(self.player.x - self.player.size/2,
                                        self.player.y - self.player.size/2,
                                        self.player.size, self.player.size)
                
                # Define staircase area at center of boss room
                staircase_rect = pygame.Rect(current_room.width // 2 - 40,
                                        current_room.height // 2 - 40,
                                        80, 80)
                
                if player_rect.colliderect(staircase_rect):
                    self._advance_to_next_floor()

    def _advance_to_next_floor(self):
        self.dungeon.current_floor += 1
        if self.dungeon.current_floor > self.dungeon.num_floors:
            # Player has completed all floors - handle victory
            self.running = False
            print("Congratulations! You've completed all floors!")
        else:
            # Generate new floor
            self.dungeon = DungeonMap(size=8, num_floors=self.dungeon.num_floors)
            self.dungeon.current_floor = self.dungeon.current_floor
            self.minimap = Minimap(self.dungeon)
            
            # Reset player position but keep upgrades
            self.player.x = self.width // 2
            self.player.y = self.height // 2
            self.player.health = min(self.player.health + 50, 200)  # Heal player between floors
            
            # Mark starting room as explored
            self.dungeon.rooms[self.dungeon.current_room_pos].explored = True
    
    def update(self):
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        
        # Update projectiles
        self.player.update_projectiles(current_room.enemies, current_room.walls)
        
        # Update enemies
        for enemy in current_room.enemies[:]:
            enemy.move_toward_player(self.player, current_room.walls)
            enemy.attack_player(self.player)
            if enemy.is_dead():
                if enemy.is_boss:
                    self._check_boss_defeat()  # Handle boss defeat
                current_room.enemies.remove(enemy)
        
        # Update power-ups
        for power_up in current_room.power_ups:
            power_up.update()
        
        # Check for power-up collection
        self._check_powerup_collection()
        
        # Check for staircase/next floor
        self._check_staircase()

    def draw(self):
        self.screen.fill((0, 0, 0))
        
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        
        # Update camera to follow player
        self.camera.update(self.player.x, self.player.y, current_room.width, current_room.height)
        
        # Draw walls with camera offset
        for wall in current_room.walls:
            # Create a copy of the wall rect with camera offset
            cam_wall = pygame.Rect(
                wall.x - self.camera.x,
                wall.y - self.camera.y,
                wall.width,
                wall.height
            )
            pygame.draw.rect(self.screen, (128, 128, 128), cam_wall)
        
        # Draw ability effects
        for ability_name, ability in self.player.abilities.items():
            if ability.should_show_effect():
                if ability_name == "aoe":
                    # Draw circle AOE with camera offset
                    player_screen_pos = self.camera.apply(self.player.x, self.player.y)
                    pygame.draw.circle(self.screen, (255, 255, 0, 128),
                                    (int(player_screen_pos[0]), int(player_screen_pos[1])),
                                    ability.range, 2)
                    
                elif ability_name == "cone":
                    # Draw cone AOE with camera offset
                    points = []
                    cone_angle = pi / 2  # 90 degrees
                    start_angle = self.player.direction - cone_angle / 2
                    end_angle = self.player.direction + cone_angle / 2
                    
                    # Get player screen position
                    player_screen_pos = self.camera.apply(self.player.x, self.player.y)
                    points.append(player_screen_pos)
                    
                    # Add points along the arc
                    for i in range(21):
                        angle = start_angle + (i / 20) * cone_angle
                        world_x = self.player.x + cos(angle) * ability.range
                        world_y = self.player.y + sin(angle) * ability.range
                        screen_x, screen_y = self.camera.apply(world_x, world_y)
                        points.append((screen_x, screen_y))
                    
                    # Close the shape
                    points.append(player_screen_pos)
                    
                    # Draw cone
                    pygame.draw.polygon(self.screen, (255, 165, 0, 128), points, 2)
                    
                elif ability_name == "projectile":
                    # Draw projectile trajectory line with camera offset
                    player_screen_pos = self.camera.apply(self.player.x, self.player.y)
                    world_end_x = self.player.x + cos(self.player.direction) * ability.range
                    world_end_y = self.player.y + sin(self.player.direction) * ability.range
                    end_screen_x, end_screen_y = self.camera.apply(world_end_x, world_end_y)
                    
                    pygame.draw.line(self.screen, (255, 255, 0, 128),
                                player_screen_pos,
                                (end_screen_x, end_screen_y), 2)
        
        # Draw projectiles with camera offset
        for projectile in self.player.projectiles:
            proj_screen_x, proj_screen_y = self.camera.apply(projectile.x, projectile.y)
            pygame.draw.circle(self.screen, (255, 255, 0), 
                            (int(proj_screen_x), int(proj_screen_y)), 5)
            
        # Draw enemies with camera offset
        for enemy in current_room.enemies:
            enemy_screen_x, enemy_screen_y = self.camera.apply(enemy.x, enemy.y)
            color = (255, 0, 0) if enemy.health > enemy.max_health / 2 else (200, 0, 0)
            pygame.draw.rect(self.screen, color,
                        pygame.Rect(enemy_screen_x - enemy.size/2, 
                                    enemy_screen_y - enemy.size/2,
                                    enemy.size, enemy.size))
            # Draw enemy health bar
            health_width = (enemy.health / enemy.max_health) * enemy.size
            pygame.draw.rect(self.screen, (0, 255, 0),
                        pygame.Rect(enemy_screen_x - enemy.size/2,
                                    enemy_screen_y - enemy.size/2 - 10,
                                    health_width, 5))
        # After drawing enemies and before drawing player...

        # Draw power-ups
        for power_up in current_room.power_ups:
            power_up_size = power_up.get_display_size()
            power_up_screen_x, power_up_screen_y = self.camera.apply(power_up.x, power_up.y)
            
            # Different colors for different power-ups
            if power_up.type == PowerUpType.HEALTH:
                color = (255, 0, 255)  # Magenta for health
            elif power_up.type == PowerUpType.DAMAGE:
                color = (255, 0, 0)    # Red for damage
            elif power_up.type == PowerUpType.SPEED:
                color = (0, 255, 255)  # Cyan for speed
            elif power_up.type == PowerUpType.COOLDOWN:
                color = (255, 255, 0)  # Yellow for cooldown
            else:
                color = (255, 120, 0)
            
            pygame.draw.circle(self.screen, color,
                            (int(power_up_screen_x), int(power_up_screen_y)),
                            int(power_up_size))

        # Draw staircase if floor is complete
        if self.dungeon.floor_completed:
            for pos, room in self.dungeon.rooms.items():
                if room.room_type == RoomType.BOSS and room.boss_defeated:
                    if pos == self.dungeon.current_room_pos:
                        stair_x, stair_y = self.camera.apply(room.width // 2, room.height // 2)
                        # Draw staircase as a special rectangle
                        stair_rect = pygame.Rect(stair_x - 40, stair_y - 40, 80, 80)
                        pygame.draw.rect(self.screen, (0, 200, 200), stair_rect)
                        pygame.draw.rect(self.screen, (0, 255, 255), stair_rect, 3)
        
        # Draw player with camera offset
        player_screen_x, player_screen_y = self.camera.apply(self.player.x, self.player.y)
        pygame.draw.rect(self.screen, (0, 255, 0),
                        pygame.Rect(player_screen_x - self.player.size/2,
                                player_screen_y - self.player.size/2,
                                self.player.size, self.player.size))
        
        # Draw player direction indicator
        end_world_x = self.player.x + cos(self.player.direction) * 20
        end_world_y = self.player.y + sin(self.player.direction) * 20
        end_screen_x, end_screen_y = self.camera.apply(end_world_x, end_world_y)
        
        pygame.draw.line(self.screen, (0, 255, 0),
                        (player_screen_x, player_screen_y),
                        (end_screen_x, end_screen_y), 2)
        
        # UI elements (not affected by camera)
        # Draw player health bar
        health_width = (self.player.health / 100) * 200
        pygame.draw.rect(self.screen, (0, 255, 0),
                        pygame.Rect(10, 10, health_width, 20))

        # Draw floor indicator
        font = pygame.font.SysFont(None, 36)
        floor_text = f"Floor: {self.dungeon.current_floor}/{self.dungeon.num_floors}"
        text_surface = font.render(floor_text, True, (255, 255, 255))
        self.screen.blit(text_surface, (self.width - 150, 10))
        
        # Draw ability cooldowns
        y = 40
        for name, ability in self.player.abilities.items():
            if ability.is_ready():
                color = (0, 255, 0)
            else:
                color = (255, 0, 0)
            pygame.draw.rect(self.screen, color,
                        pygame.Rect(10, y, 20, 20))
            y += 30
        
        # Draw minimap (not affected by camera)
        self.minimap.draw(self.screen)
        
        pygame.display.flip()
    
    def run(self):
        while self.running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                    
            self.handle_input()
            self.update()
            self.draw()
            self.clock.tick(60)
            
        pygame.quit()

if __name__ == "__main__":
    game = Game()
    game.run()
