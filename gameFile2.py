import pygame
import random
from enum import Enum
from typing import Dict, Set, Tuple, Optional, List
from math import sqrt, cos, sin, atan2, pi
from dataclasses import dataclass
from time import time

def cart_to_iso(x, y):
    """Convert Cartesian coordinates to isometric screen coordinates"""
    iso_x = (x - y)
    iso_y = (x + y) / 2
    return iso_x, iso_y

def iso_to_cart(iso_x, iso_y):
    """Convert isometric screen coordinates back to Cartesian coordinates"""
    x = (iso_x + 2 * iso_y) / 2
    y = (2 * iso_y - iso_x) / 2
    return x, y

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
        self.iso_x, self.iso_y = cart_to_iso(x, y)
        self.health = 200
        self.speed = 5
        self.direction = 0
        self.sprite = None
        self.size = 24
        
        # Define abilities
        self.abilities = {
            "aoe": Ability("Circle of Damage", 20, 3.0, 150),
            "cone": Ability("Forward Slash", 30, 1.5, 150),
            "projectile": Ability("Energy Bolt", 25, 2.0, 500)
        }
        
        self.projectiles: List[Projectile] = []
        
    def move(self, dx: int, dy: int, walls: List[pygame.Rect]):
        # Calculate new position in Cartesian coordinates
        new_x = self.x + dx * self.speed
        new_y = self.y + dy * self.speed
        
        # Check collision in Cartesian space
        player_rect = pygame.Rect(new_x - self.size/2, new_y - self.size/2, 
                                self.size, self.size)
        
        if not any(player_rect.colliderect(wall) for wall in walls):
            self.x = new_x
            self.y = new_y
            # Update isometric coordinates
            self.iso_x, self.iso_y = cart_to_iso(new_x, new_y)
            
        # Update direction based on movement
        if dx != 0 or dy != 0:
            self.direction = atan2(dy, dx)
        
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

class Enemy:
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y
        self.iso_x, self.iso_y = cart_to_iso(x, y)
        self.health = 50
        self.max_health = 50
        self.speed = 2
        self.damage = 5
        self.size = 24
        self.attack_cooldown = 1.0
        self.last_attack = 0
        
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
                # Update isometric coordinates
                self.iso_x, self.iso_y = cart_to_iso(new_x, new_y)
        
    def take_damage(self, amount: int):
        self.health -= amount
        
    def is_dead(self) -> bool:
        return self.health <= 0
                
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
        self.width = 800
        self.height = 600
        self.walls: List[pygame.Rect] = []
        self.iso_walls: List[pygame.Rect] = []  # Store isometric wall positions
        self.enemies: List[Enemy] = []
        self.doors: Dict[Direction, bool] = {
            Direction.NORTH: False,
            Direction.SOUTH: False,
            Direction.EAST: False,
            Direction.WEST: False
        }
        self.explored = False
        self.tile_width = 64  # Width of isometric tile
        self.tile_height = 32  # Height of isometric tile
        self.generate_layout()
        self.spawn_enemies()
        
    def generate_layout(self):
        # Clear existing walls
        self.walls = []
        self.iso_walls = []
        
        # Add walls with gaps for doors
        wall_thickness = 20
        door_width = 80
        
        # Define walls in Cartesian coordinates first
        cart_walls = []
        
        # Top wall with potential door
        if not self.doors[Direction.NORTH]:
            cart_walls.extend([
                pygame.Rect(0, 0, self.width // 2 - door_width // 2, wall_thickness),
                pygame.Rect(self.width // 2 + door_width // 2, 0, 
                          self.width // 2 - door_width // 2, wall_thickness)
            ])
        
        # Bottom wall with potential door
        if not self.doors[Direction.SOUTH]:
            cart_walls.extend([
                pygame.Rect(0, self.height - wall_thickness, 
                          self.width // 2 - door_width // 2, wall_thickness),
                pygame.Rect(self.width // 2 + door_width // 2, 
                          self.height - wall_thickness,
                          self.width // 2 - door_width // 2, wall_thickness)
            ])
        
        # Left wall with potential door
        if not self.doors[Direction.WEST]:
            cart_walls.extend([
                pygame.Rect(0, 0, wall_thickness, self.height // 2 - door_width // 2),
                pygame.Rect(0, self.height // 2 + door_width // 2,
                          wall_thickness, self.height // 2 - door_width // 2)
            ])
        
        # Right wall with potential door
        if not self.doors[Direction.EAST]:
            cart_walls.extend([
                pygame.Rect(self.width - wall_thickness, 0,
                          wall_thickness, self.height // 2 - door_width // 2),
                pygame.Rect(self.width - wall_thickness, 
                          self.height // 2 + door_width // 2,
                          wall_thickness, self.height // 2 - door_width // 2)
            ])
            
        # Add random obstacles if this is not a boss or treasure room
        if self.room_type not in [RoomType.BOSS, RoomType.TREASURE]:
            for _ in range(5):
                x = random.randint(wall_thickness + 50, self.width - wall_thickness - 100)
                y = random.randint(wall_thickness + 50, self.height - wall_thickness - 100)
                cart_walls.append(pygame.Rect(x, y, 50, 50))
        
        # Store Cartesian walls for collision detection
        self.walls = cart_walls
        
        # Create isometric versions of walls for rendering
        for wall in cart_walls:
            # Convert the four corners to isometric
            corners = [
                cart_to_iso(wall.x, wall.y),
                cart_to_iso(wall.x + wall.width, wall.y),
                cart_to_iso(wall.x + wall.width, wall.y + wall.height),
                cart_to_iso(wall.x, wall.y + wall.height)
            ]
            
            # Find bounding box in isometric space
            min_x = min(p[0] for p in corners)
            max_x = max(p[0] for p in corners)
            min_y = min(p[1] for p in corners)
            max_y = max(p[1] for p in corners)
            
            # Create an isometric rectangle that encompasses the wall
            iso_rect = pygame.Rect(
                min_x, min_y,
                max_x - min_x, max_y - min_y
            )
            self.iso_walls.append((iso_rect, corners))
        
    def spawn_enemies(self):
        if self.room_type == RoomType.BOSS:
            # Spawn boss (stronger enemy)
            boss = Enemy(self.width // 2, self.height // 2)
            boss.health = 200
            boss.max_health = 200
            boss.damage = 15
            boss.size = 48
            self.enemies = [boss]
        elif self.room_type == RoomType.NORMAL:
            # Spawn 2-4 regular enemies
            num_enemies = random.randint(2, 4)
            self.enemies = []
            for _ in range(num_enemies):
                x = random.randint(50, self.width - 50)
                y = random.randint(50, self.height - 50)
                self.enemies.append(Enemy(x, y))

class DungeonMap:
    def __init__(self, size: int = 5):
        self.size = size
        self.rooms: Dict[Tuple[int, int], Room] = {}
        self.current_room_pos = (0, 0)
        self.generate_dungeon()
        
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
        self.player = Player(self.width // 2, self.height // 2)
        
        # Mark starting room as explored
        self.dungeon.rooms[self.dungeon.current_room_pos].explored = True
    
    def _check_room_transition(self):
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        player_rect = pygame.Rect(self.player.x, self.player.y, 32, 32)
        
        # Define door areas
        door_areas = {
            Direction.NORTH: pygame.Rect(self.width // 2 - 40, 0, 80, 20),
            Direction.SOUTH: pygame.Rect(self.width // 2 - 40, self.height - 20, 80, 20),
            Direction.WEST: pygame.Rect(0, self.height // 2 - 40, 20, 80),
            Direction.EAST: pygame.Rect(self.width - 20, self.height // 2 - 40, 20, 80)
        }
        
        # Check collisions with door areas
        for direction, door_area in door_areas.items():
            if (current_room.doors[direction] and 
                player_rect.colliderect(door_area)):
                self._transition_room(direction)
                return  # Exit after first transition
    
    def _find_safe_position(self, room: Room, base_x: int, base_y: int) -> Tuple[int, int]:
        """Find a safe position near the given coordinates that doesn't collide with walls."""
        # Try positions in an expanding square pattern
        for offset in range(0, 200, 20):  # Try up to 200 pixels away in 20px steps
            for dx in [-offset, offset]:
                for dy in [-offset, offset]:
                    test_x = base_x + dx
                    test_y = base_y + dy
                    
                    # Create test rectangle for player position
                    test_rect = pygame.Rect(test_x, test_y, 32, 32)
                    
                    # Check if position is clear of walls
                    if not any(test_rect.colliderect(wall) for wall in room.walls):
                        # Also check if position is within room bounds
                        if (20 < test_x < self.width - 52 and 
                            20 < test_y < self.height - 52):
                            return test_x, test_y
                            
        # If no safe position found, return center of room as last resort
        return self.width // 2, self.height // 2

    def _transition_room(self, direction: Direction):
        new_pos = (
            self.dungeon.current_room_pos[0] + direction.value[0],
            self.dungeon.current_room_pos[1] + direction.value[1]
        )
        
        if new_pos in self.dungeon.rooms:
            # Update current room
            self.dungeon.current_room_pos = new_pos
            new_room = self.dungeon.rooms[new_pos]
            new_room.explored = True
            
            # Calculate initial desired position
            if direction == Direction.NORTH:
                base_x = self.width // 2
                base_y = self.height - 100
            elif direction == Direction.SOUTH:
                base_x = self.width // 2
                base_y = 100
            elif direction == Direction.WEST:
                base_x = self.width - 100
                base_y = self.height // 2
            else:  # EAST
                base_x = 100
                base_y = self.height // 2
            
            # Find safe position near the desired spawn point
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
    
    def _sort_entities_by_depth(self, entities):
        """Sort entities by their Y coordinate for proper isometric depth"""
        return sorted(entities, key=lambda e: e.y)
    
    def update(self):
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        
        # Update projectiles
        self.player.update_projectiles(current_room.enemies, current_room.walls)
        
        # Update enemies
        for enemy in current_room.enemies[:]:
            enemy.move_toward_player(self.player, current_room.walls)
            enemy.attack_player(self.player)
            if enemy.is_dead():
                current_room.enemies.remove(enemy)
                
        # Update isometric coordinates for all entities
        for entity in current_room.enemies + [self.player]:
            entity.iso_x, entity.iso_y = cart_to_iso(entity.x, entity.y)

    def draw(self):
        self.screen.fill((0, 0, 0))
        
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        
        # Calculate room offset to center the view
        room_offset_x = self.width // 2
        room_offset_y = self.height // 3
        
        # Draw floor (grid of tiles)
        tile_width = 64
        tile_height = 32
        for y in range(0, self.height, 64):
            for x in range(0, self.width, 64):
                iso_x, iso_y = cart_to_iso(x, y)
                iso_x += room_offset_x
                iso_y += room_offset_y
                
                # Draw isometric tile (simple diamond shape)
                points = [
                    (iso_x, iso_y - tile_height // 2),
                    (iso_x + tile_width // 2, iso_y),
                    (iso_x, iso_y + tile_height // 2),
                    (iso_x - tile_width // 2, iso_y)
                ]
                pygame.draw.polygon(self.screen, (50, 50, 50), points)
                pygame.draw.polygon(self.screen, (100, 100, 100), points, 1)
        
        # Draw walls
        for iso_rect, corners in current_room.iso_walls:
            # Translate corners by room offset
            adjusted_corners = [(x + room_offset_x, y + room_offset_y) for x, y in corners]
            pygame.draw.polygon(self.screen, (128, 128, 128), adjusted_corners)
            pygame.draw.polygon(self.screen, (200, 200, 200), adjusted_corners, 1)
        
        # Draw ability effects in isometric space
        for ability_name, ability in self.player.abilities.items():
            if ability.should_show_effect():
                if ability_name == "aoe":
                    # Draw circle AOE as an ellipse in isometric view
                    iso_x, iso_y = self.player.iso_x + room_offset_x, self.player.iso_y + room_offset_y
                    pygame.draw.ellipse(self.screen, (255, 255, 0, 128),
                                    (iso_x - ability.range, iso_y - ability.range//2,
                                    ability.range * 2, ability.range),
                                    2)
                    
                # Other ability visualizations can be updated similarly...
        
        # Draw projectiles
        for projectile in self.player.projectiles:
            iso_x, iso_y = cart_to_iso(projectile.x, projectile.y)
            iso_x += room_offset_x
            iso_y += room_offset_y
            pygame.draw.circle(self.screen, (255, 255, 0), 
                            (int(iso_x), int(iso_y)), 5)
        
        # Sort entities by Y position for proper depth
        entities = [(enemy.iso_y, enemy) for enemy in current_room.enemies]
        entities.append((self.player.iso_y, self.player))
        entities.sort(key=lambda e: e[0])
        
        # Draw entities in sorted order
        for _, entity in entities:
            iso_x, iso_y = entity.iso_x + room_offset_x, entity.iso_y + room_offset_y
            
            if isinstance(entity, Enemy):
                color = (255, 0, 0) if entity.health > entity.max_health / 2 else (200, 0, 0)
                # Draw enemy as diamond shape
                points = [
                    (iso_x, iso_y - entity.size//2),
                    (iso_x + entity.size//2, iso_y),
                    (iso_x, iso_y + entity.size//2),
                    (iso_x - entity.size//2, iso_y)
                ]
                pygame.draw.polygon(self.screen, color, points)
                pygame.draw.polygon(self.screen, (255, 255, 255), points, 1)
                
                # Draw enemy health bar above in isometric space
                health_width = (entity.health / entity.max_health) * entity.size
                pygame.draw.rect(self.screen, (0, 255, 0),
                            pygame.Rect(iso_x - health_width//2,
                                        iso_y - entity.size,
                                        health_width, 5))
            else:  # Player
                # Draw player as diamond shape
                points = [
                    (iso_x, iso_y - self.player.size//2),
                    (iso_x + self.player.size//2, iso_y),
                    (iso_x, iso_y + self.player.size//2),
                    (iso_x - self.player.size//2, iso_y)
                ]
                pygame.draw.polygon(self.screen, (0, 255, 0), points)
                pygame.draw.polygon(self.screen, (255, 255, 255), points, 1)
                
                # Draw player direction indicator
                angle = self.player.direction
                end_x = iso_x + cos(angle) * 20
                end_y = iso_y + sin(angle) * 10  # Half Y scale for isometric
                pygame.draw.line(self.screen, (0, 255, 0),
                            (iso_x, iso_y),
                            (end_x, end_y), 2)
        
        # Draw UI elements (these stay in screen space, not isometric)
        # Draw player health bar
        health_width = (self.player.health / 200) * 200
        pygame.draw.rect(self.screen, (0, 255, 0),
                        pygame.Rect(10, 10, health_width, 20))
        
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
        
        # Draw minimap (remains unchanged)
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
