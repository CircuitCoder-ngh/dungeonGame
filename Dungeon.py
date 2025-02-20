from Objects import *

# UI: add floor timer
# UI: add enemy count
# add more powerups
# add gold drops for buying health/armor between floors
# add exp points,


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
        self.total_enemies = len(self.enemies)  # Store initial enemy count

        # New attributes for floor tiles
        self.floor_spritesheet = pygame.image.load("tiles/floor.png").convert_alpha()
        self.floor_tile_size = 32
        self.floor_tiles = self._load_floor_tiles()
        self.floor_grid = self._generate_floor_grid()

    def _load_floor_tiles(self):
        tiles = []
        sheet_width = self.floor_spritesheet.get_width()
        sheet_height = self.floor_spritesheet.get_height()
        
        # Extract all 32x32 tiles from the spritesheet
        for y in range(0, sheet_height, self.floor_tile_size):
            for x in range(0, sheet_width, self.floor_tile_size):
                rect = pygame.Rect(x, y, self.floor_tile_size, self.floor_tile_size)
                tile = pygame.Surface((self.floor_tile_size, self.floor_tile_size), pygame.SRCALPHA)
                tile.blit(self.floor_spritesheet, (0, 0), rect)
                tiles.append(tile)
        
        return tiles

    def _generate_floor_grid(self):
        # Create a grid of tile indexes for the floor
        grid = []
        rows = self.height // self.floor_tile_size
        cols = self.width // self.floor_tile_size
        
        # Choose floor tile patterns based on room type
        if self.room_type == RoomType.START:
            main_tile = random.randint(10,500)  # Index of your starting room floor tile
        elif self.room_type == RoomType.BOSS:
            main_tile = random.randint(10,500)  # Index of your boss room floor tile
        elif self.room_type == RoomType.TREASURE:
            main_tile = random.randint(10,500)  # Index of your treasure room floor tile
        else:
            main_tile = random.randint(10,500)  # Index of your normal room floor tile
        
        # Generate grid with occasional variety
        for row in range(rows):
            grid_row = []
            for col in range(cols):
                tile_idx = main_tile
                # if random.random() < 0.1:  # 10% chance for a variation
                #     tile_idx = random.choice([i for i in range(len(self.floor_tiles)) if i != main_tile])                    
                grid_row.append(tile_idx)
            grid.append(grid_row)
        
        return grid
        
    def _find_safe_enemy_position(self, size: int) -> Tuple[int, int]:
        """Find a safe position that doesn't collide with walls for an enemy of given size."""
        for _ in range(100):  # Try up to 100 times to find a safe position
            x = random.randint(50, self.width - 50)
            y = random.randint(50, self.height - 50)
            
            test_rect = pygame.Rect(x - size/2, y - size/2, size, size)
            
            if not any(test_rect.colliderect(wall) for wall in self.walls):
                return x, y
                
        # If we couldn't find a position after 100 tries, use the center (should be safe)
        return self.width // 2, self.height // 2

    def spawn_enemies(self):
        if self.room_type == RoomType.BOSS:
            # Spawn boss (stronger enemy)
            boss_size = 48
            x, y = self._find_safe_enemy_position(boss_size)
            boss = Enemy(x, y, is_boss=True)
            boss.health = 200
            boss.max_health = 200
            boss.damage = 15
            boss.size = boss_size
            self.enemies = [boss]
        elif self.room_type == RoomType.NORMAL:
            # Spawn 2-4 regular enemies
            num_enemies = random.randint(2, 4)
            self.enemies = []
            for _ in range(num_enemies):
                enemy_size = 32  # Default enemy size
                x, y = self._find_safe_enemy_position(enemy_size)
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
                obstacle_width = random.randint(30, 80)
                obstacle_height = random.randint(30, 80)
                x = random.randint(wall_thickness + 50, self.width - wall_thickness - 50 - obstacle_width)
                y = random.randint(wall_thickness + 50, self.height - wall_thickness - 50 - obstacle_height) 
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

    def count_enemies(self):
        """Returns tuple of (alive enemies, total enemies) for the current floor"""
        alive_count = sum(len(room.enemies) for room in self.rooms.values())
        total_count = sum(room.total_enemies for room in self.rooms.values())
        return alive_count, total_count
        
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

class FlashMessage:
    def __init__(self, text: str, duration: float = 3.0):
        self.text = text
        self.duration = duration
        self.start_time = time()
        self.alpha = 255
        self.font = pygame.font.SysFont(None, 72)
    
    def is_active(self) -> bool:
        return time() - self.start_time < self.duration
    
    def get_alpha(self) -> int:
        elapsed = time() - self.start_time
        if elapsed < 0.5:  # Fade in
            return int(255 * (elapsed / 0.5))
        elif elapsed > self.duration - 0.5:  # Fade out
            return int(255 * (1 - (elapsed - (self.duration - 0.5)) / 0.5))
        else:
            return 255
    
    def draw(self, screen: pygame.Surface):
        if not self.is_active():
            return
        
        text_surface = self.font.render(self.text, True, (255, 255, 0))
        text_surface.set_alpha(self.get_alpha())
        text_rect = text_surface.get_rect(center=(screen.get_width()//2, screen.get_height()//2))
        screen.blit(text_surface, text_rect)


