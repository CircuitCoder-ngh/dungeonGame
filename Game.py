from Dungeon import *
from Objects import *

class Game:
    def __init__(self):
        pygame.init()
        self.width = 800
        self.height = 600
        self.screen = pygame.display.set_mode((self.width, self.height))
        self.clock = pygame.time.Clock()
        self.running = True

        self.flash_message = None
        
        self.dungeon = DungeonMap(size=4)  # Create 8 rooms
        self.minimap = Minimap(self.dungeon)
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        safe_x, safe_y = self._find_safe_position(current_room, self.width // 2, self.height // 2)
        self.player = Player(safe_x, safe_y)
        
        # Add camera
        self.camera = Camera(self.width, self.height)

        # Mark starting room as explored
        self.dungeon.rooms[self.dungeon.current_room_pos].explored = True
        # New attributes for floor tiles
        self.feat_spritesheet = pygame.image.load("tiles/feat.png").convert_alpha()
        self.feat_tile_size = 32
        self.feat_tiles = self._load_feat_tiles()
        row = 9  
        col = 29  
        self.staircase_sprite = self._get_sprite_from_sheet(row, col)
        self.staircase_sprite = pygame.transform.scale(self.staircase_sprite, (80, 80))  # Match the size of the current rectangle

        # self.floor_grid = self._generate_floor_grid()

    def _load_feat_tiles(self):
        tiles = []
        sheet_width = self.feat_spritesheet.get_width()
        sheet_height = self.feat_spritesheet.get_height()
        x_offset = 2
        y_offset = 2
        
        # Extract all 32x32 tiles from the spritesheet
        for y in range(0, sheet_height, self.feat_tile_size):
            for x in range(0, sheet_width, self.feat_tile_size):
                rect = pygame.Rect(x+x_offset, y+y_offset, self.feat_tile_size, self.feat_tile_size)
                tile = pygame.Surface((self.feat_tile_size, self.feat_tile_size), pygame.SRCALPHA)
                tile.blit(self.feat_spritesheet, (0, 0), rect)
                tiles.append(tile)
        
        return tiles

    def _get_sprite_from_sheet(self, row: int, col: int) -> pygame.Surface:
        """Get a specific sprite from the spritesheet by row and column."""
        index = row * (self.feat_spritesheet.get_width() // self.feat_tile_size) + col
        return self.feat_tiles[index]

    def _check_room_transition(self):
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        player_rect = pygame.Rect(self.player.x, self.player.y, 32, 32)
        
        # Define door areas for a larger room
        door_areas = {
            Direction.NORTH: pygame.Rect(current_room.width // 2 - 40, 0, 80, 5),
            Direction.SOUTH: pygame.Rect(current_room.width // 2 - 40, current_room.height - 5, 80, 5),
            Direction.WEST: pygame.Rect(0, current_room.height // 2 - 40, 5, 80),
            Direction.EAST: pygame.Rect(current_room.width - 5, current_room.height // 2 - 40, 5, 80)
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
                    
                    # slightly larger than 32x32 player, to give some margin for error
                    test_rect = pygame.Rect(test_x, test_y, 48, 48)
                    
                    if not any(test_rect.colliderect(wall) for wall in room.walls):
                        if (10 < test_x < room.width - 10 and 
                            10 < test_y < room.height - 10):
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
                base_y = new_room.height - 24
            elif direction == Direction.SOUTH:
                base_x = new_room.width // 2
                base_y = 24
            elif direction == Direction.WEST:
                base_x = new_room.width - 24
                base_y = new_room.height // 2
            else:  # EAST
                base_x = 24
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
                    print(f"Advancing from floor {self.dungeon.current_floor}")
                    self._advance_to_next_floor()
                    print(f"Now on floor {self.dungeon.current_floor}")

    def _advance_to_next_floor(self):
        self.dungeon.current_floor += 1
        current_floor = self.dungeon.current_floor
        if self.dungeon.current_floor > self.dungeon.num_floors:
            # Player has completed all floors - handle victory
            self.running = False
            print("Congratulations! You've completed all floors!")
        else:
            # Generate new floor
            self.dungeon = DungeonMap(size=8, num_floors=self.dungeon.num_floors)
            self.dungeon.current_floor = current_floor
            self.minimap = Minimap(self.dungeon)
            
            # Reset player position but keep upgrades
            current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
            safe_x, safe_y = self._find_safe_position(current_room, self.width // 2, self.height // 2)
        
            self.player.x = safe_x
            self.player.y = safe_y
            self.player.health = min(self.player.health + 50, 200)  # Heal player between floors
            
            # Mark starting room as explored
            self.dungeon.rooms[self.dungeon.current_room_pos].explored = True
    
    def update(self):
        # Calculate delta time
        dt = self.clock.get_time() / 1000  # Convert milliseconds to seconds
        
        current_room = self.dungeon.rooms[self.dungeon.current_room_pos]
        
        # Update player animations
        self.player.update_animation(dt)

        # Update abilities 
        self.player.update_ability_effects(current_room.enemies, dt)

        for ability in self.player.abilities.values():
            ability.update(dt)

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
                # Check if all enemies are gone after each enemy death
                if self.dungeon.is_floor_complete() and any(room.room_type == RoomType.BOSS and room.boss_defeated 
                                                        for room in self.dungeon.rooms.values()):
                    if not self.dungeon.floor_completed:
                        self.dungeon.floor_completed = True
                        print("Floor complete! Spawning staircase")
                        self.dungeon.spawn_staircase()
                        self.flash_message = FlashMessage("Level Cleared!")
        
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
        
        # Draw floor tiles
        for row in range(len(current_room.floor_grid)):
            for col in range(len(current_room.floor_grid[row])):
                tile_idx = current_room.floor_grid[row][col]
                tile = current_room.floor_tiles[tile_idx]
                
                # Calculate world position
                world_x = col * current_room.floor_tile_size
                world_y = row * current_room.floor_tile_size
                
                # Apply camera offset
                screen_x, screen_y = self.camera.apply(world_x, world_y)
                
                # Only draw tiles that are in the camera view
                if (-current_room.floor_tile_size <= screen_x <= self.width and
                    -current_room.floor_tile_size <= screen_y <= self.height):
                    self.screen.blit(tile, (screen_x, screen_y))

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
                    current_frame = ability.get_current_frame()
                    if current_frame:
                        player_screen_pos = self.camera.apply(self.player.x, self.player.y)
                        frame_rect = current_frame.get_rect(center=player_screen_pos)
                        self.screen.blit(current_frame, frame_rect)
                        pygame.draw.circle(self.screen, (255, 255, 0, 64),
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
                    
                # elif ability_name == "projectile":
                #     # Draw projectile trajectory line with camera offset
                #     player_screen_pos = self.camera.apply(self.player.x, self.player.y)
                #     world_end_x = self.player.x + cos(self.player.direction) * ability.range
                #     world_end_y = self.player.y + sin(self.player.direction) * ability.range
                #     end_screen_x, end_screen_y = self.camera.apply(world_end_x, world_end_y)
                    
                #     pygame.draw.line(self.screen, (255, 255, 0, 128),
                #                 player_screen_pos,
                #                 (end_screen_x, end_screen_y), 2)
        
        # Draw projectiles with camera offset
        for projectile in self.player.projectiles:
            proj_screen_x, proj_screen_y = self.camera.apply(projectile.x, projectile.y)
            pygame.draw.circle(self.screen, (255, 255, 0), 
                            (int(proj_screen_x), int(proj_screen_y)), 5)
            
        # Draw enemies with camera offset
        for enemy in current_room.enemies:
            enemy_screen_x, enemy_screen_y = self.camera.apply(enemy.x, enemy.y)
            if enemy.is_boss:
                color = (255, 0, 0) if enemy.health > enemy.max_health / 2 else (200, 0, 0)
                pygame.draw.rect(self.screen, color,
                            pygame.Rect(enemy_screen_x - enemy.size/2, 
                                        enemy_screen_y - enemy.size/2,
                                        enemy.size, enemy.size))
            else:
                current_frame = enemy.get_current_frame()
                frame_rect = current_frame.get_rect(center=(enemy_screen_x, enemy_screen_y))
                self.screen.blit(current_frame, frame_rect)

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
            pygame.draw.circle(self.screen, power_up.color,
                            (int(power_up_screen_x), int(power_up_screen_y)),
                            int(power_up_size))

        # Draw staircase if floor is complete
        if self.dungeon.floor_completed:
            for pos, room in self.dungeon.rooms.items():
                if room.room_type == RoomType.BOSS and room.boss_defeated:
                    if pos == self.dungeon.current_room_pos:
                        stair_x, stair_y = self.camera.apply(room.width // 2, room.height // 2)
                        # Draw staircase sprite
                        stair_rect = self.staircase_sprite.get_rect(
                            center=(stair_x, stair_y)
                        )
                        self.screen.blit(self.staircase_sprite, stair_rect)

        # Draw player with camera offset
        player_screen_x, player_screen_y = self.camera.apply(self.player.x, self.player.y)

        # Get current frame
        current_frame = self.player.get_current_frame()
        frame_rect = current_frame.get_rect(center=(player_screen_x, player_screen_y))
        self.screen.blit(current_frame, frame_rect)

        # Direction indicator is still useful for abilities
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
        
        # Draw enemy counter
        alive_enemies, total_enemies = self.dungeon.count_enemies()
        enemy_text = f"Enemies: {alive_enemies}/{total_enemies}"
        enemy_surface = font.render(enemy_text, True, (255, 255, 255))
        self.screen.blit(enemy_surface, (self.width - 150, 50))

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

        # Draw flash message if active
        if self.flash_message and self.flash_message.is_active():
            self.flash_message.draw(self.screen)
        
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