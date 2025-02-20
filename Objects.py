import pygame
import random
from enum import Enum
from typing import Dict, Set, Tuple, Optional, List
from math import sqrt, cos, sin, atan2, pi
from dataclasses import dataclass
from time import time

from dataclasses import dataclass
from typing import List, Optional
import pygame
from time import time

@dataclass
class AnimationFrame:
    surface: pygame.Surface
    duration: float  # Duration in seconds

@dataclass
class ActiveAbilityEffect:
    ability_name: str
    x: float
    y: float
    direction: float
    damage: int
    range: int
    duration: float
    start_time: float
    hit_enemies: Dict[int, float]  # Set of enemy IDs that have been hit
    
    def is_expired(self) -> bool:
        return time() - self.start_time >= self.duration

class AbilityAnimation:
    def __init__(self, frames: List[AnimationFrame], scale: float = 1.0):
        self.frames = frames
        self.current_frame = 0
        self.elapsed_time = 0
        self.scale = scale
        self.finished = False
        self.effect_duration = 0.5
        
    def update(self, dt: float):
        if self.finished:
            return
            
        self.elapsed_time += dt
        
        # Check if we should advance to next frame
        while self.elapsed_time >= self.frames[self.current_frame].duration:
            self.elapsed_time -= self.frames[self.current_frame].duration
            self.current_frame += 1
            
            if self.current_frame >= len(self.frames):
                # self.finished = True
                self.current_frame = 0
                break
                
    def get_current_frame(self) -> Optional[pygame.Surface]:
        if self.finished:
            return None
        elif self.current_frame >= len(self.frames):
            self.current_frame = 0
        return self.frames[self.current_frame].surface

class Ability:
    def __init__(self, name: str, damage: int, cooldown: float, range: int):
        self.name = name
        self.damage = damage
        self.cooldown = cooldown
        self.range = range
        self.last_used = 0
        self.duration = 0.5
        self.current_animation: Optional[AbilityAnimation] = None
        
        # Load animation frames for AOE ability
        if name == "Circle of Damage":
            self.animation_frames = self._load_aoe_animation()
        else:
            self.animation_frames = []
    
    def _load_aoe_animation(self) -> List[AnimationFrame]:
        # Load your AOE effect spritesheet
        spritesheet = pygame.image.load("tiles/player.png").convert_alpha()
        frames = []
        
        # Assuming the spritesheet has 8 64x64 frames horizontally
        frame_width = 32
        frame_height = 32
        frame_duration = 0.05  # 50ms per frame
        sprite_offset_x = 32 * 12 + 24
        sprite_offset_y = 32 * 33 + 22
        
        for i in range(4):  # Adjust based on your actual number of frames
            # Extract frame from spritesheet
            rect = pygame.Rect(
                sprite_offset_x + 32 * i,  #col * self.frame_width,
                sprite_offset_y,  # row * self.frame_height,
                frame_width, frame_height
            )
            frame_surface = pygame.Surface((frame_width, frame_height), pygame.SRCALPHA)
            frame_surface.blit(spritesheet, (0, 0), rect)
             
            # Scale frame to match the ability's range
            scaled_size = int(self.range * 1.9)  # Diameter = range * 2
            scaled_frame = pygame.transform.scale(frame_surface, 
                                               (scaled_size, scaled_size))
            scaled_frame.set_alpha(64)
            frames.append(AnimationFrame(scaled_frame, frame_duration))
            
        return frames
    
    def is_ready(self) -> bool:
        return time() - self.last_used >= self.cooldown
    
    def use(self, x: float, y: float, direction: float) -> ActiveAbilityEffect:
        self.last_used = time()
        if self.animation_frames:
            self.current_animation = AbilityAnimation(self.animation_frames)
        
        return ActiveAbilityEffect(
            ability_name=self.name,
            x=x,
            y=y,
            direction=direction,
            damage=self.damage,
            range=self.range,
            duration=self.duration,
            start_time=time(),
            hit_enemies=dict()
        )

    def update(self, dt: float):
        if self.current_animation:
            self.current_animation.update(dt)
            if self.current_animation.finished:
                self.current_animation = None
     
    def get_current_frame(self) -> Optional[pygame.Surface]:
        if self.current_animation:
            return self.current_animation.get_current_frame()
        return None
        
    def should_show_effect(self) -> bool:
        return time() - self.last_used < self.duration

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

class PlayerState:
    IDLE = 0
    WALKING = 1
    SLASHING = 2
    SLAMMING = 3
    SHOOTING = 4

class Player:  
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y
        self.health = 200
        self.speed = 5
        self.direction = 0
        self.size = 32
        self.has_multi_shot = False
        
        # Load spritesheet
        # row1-3=idle, row4=running
        # row5=running right, row6=running back
        # row7=fwd attack, row8=right atk, 9=back atk
        self.spritesheet = pygame.image.load("sprites/characters/player.png").convert_alpha()
        self.frame_width = 16  # Looks like 16x16 tiles based on your image
        self.frame_height = 20
        self.sprite_offset_x = 16  # Horizontal offset if sprites don't start at left edge
        self.sprite_offset_y = 20  # Vertical offset if sprites don't start at top edge
        
        # Animations
        self.animations = self._load_animations()
        self.current_animation = 'idle_down'
        self.frame_index = 0
        self.animation_speed = 0.1
        self.animation_timer = 0
        self.state = PlayerState.IDLE
        self.attack_timer = 0
        
        # Define abilities
        self.abilities = {
            "aoe": Ability("Circle of Damage", 6, 1.5, 150),
            "cone": Ability("Forward Slash", 30, 1.5, 150),
            "projectile": Ability("Energy Bolt", 25, 0.05, 500)
        }
        
        self.projectiles: List[Projectile] = []
        self.active_effects: List[ActiveAbilityEffect] = []

    def _load_animations(self):
        animations = {
            'walk_down': [],
            'walk_up': [],
            'walk_left': [],
            'walk_right': [],
            'idle_down': [],
            'idle_up': [],
            'idle_left': [],
            'idle_right': [],
            'atk_up': [],
            'atk_left': [],
            'atk_right': [],
            'atk_down': []
        }
        
        # Extract frames from spritesheet
        for col in range(6):
            # Row 0: Walking down
            animations['walk_down'].append(self._get_frame(col, 3))
            # Row 1: Walking up
            animations['walk_up'].append(self._get_frame(col, 5))
            # Row 3: Walking right
            frame = self._get_frame(col, 4)
            flipped_frame = pygame.transform.flip(frame, True, False)
            animations['walk_right'].append(frame)
            animations['walk_left'].append(flipped_frame)
        for col in range(3):
            # attack animations
            animations['atk_down'].append(self._get_frame(col, 6))
            frame = self._get_frame(col, 7)
            animations['atk_right'].append(frame)
            flipped_frame = pygame.transform.flip(frame, True, False)
            animations['atk_left'].append(flipped_frame)
            animations['atk_up'].append(self._get_frame(col, 8))
            
        # Set idle animations (just use first frame of each direction)
        animations['idle_down'] = [animations['walk_down'][0]]
        animations['idle_up'] = [animations['walk_up'][0]]
        animations['idle_left'] = [animations['walk_left'][0]]
        animations['idle_right'] = [animations['walk_right'][0]]
        
        return animations
    
    def _get_frame(self, col, row):
        # Adjust rect to include offsets
        rect = pygame.Rect(
            self.sprite_offset_x + 48 * col,  #col * self.frame_width,
            self.sprite_offset_y + 48 * row,  # row * self.frame_height,
            self.frame_width, self.frame_height
        )
        frame = pygame.Surface((self.frame_width, self.frame_height), pygame.SRCALPHA)
        frame.blit(self.spritesheet, (0, 0), rect)
        return pygame.transform.scale(frame, (self.size, self.size))

    def update_animation(self, dt):
        # Update attack state
        if self.state in [PlayerState.SLASHING, PlayerState.SLAMMING, PlayerState.SHOOTING]:
            self.attack_timer += dt
            if self.attack_timer > 0.3:  # Duration for attack animation
                # Revert to idle state
                if 'atk_up' in self.current_animation:
                    self.current_animation = 'idle_up'
                elif 'atk_down' in self.current_animation:
                    self.current_animation = 'idle_down'
                elif 'atk_left' in self.current_animation:
                    self.current_animation = 'idle_left'
                elif 'atk_right' in self.current_animation:
                    self.current_animation = 'idle_right'
                self.state = PlayerState.IDLE
                self.attack_timer = 0
        
        self.animation_timer += dt
        if self.animation_timer >= self.animation_speed:
            self.animation_timer = 0
            self.frame_index = (self.frame_index + 1) % len(self.animations[self.current_animation])

    def get_current_frame(self):
        frames = self.animations[self.current_animation]
        # Use modulo with the actual length of the current animation
        valid_index = self.frame_index % len(frames)
        return frames[valid_index]

    def set_animation_based_on_movement(self, dx, dy):
        if dx > 0:
            self.current_animation = 'walk_right'
        elif dx < 0:
            self.current_animation = 'walk_left'
        elif dy > 0:
            self.current_animation = 'walk_down'
        elif dy < 0:
            self.current_animation = 'walk_up'
        else:
            # Convert from walk to idle
            if self.current_animation == 'walk_right':
                self.current_animation = 'idle_right'
            elif self.current_animation == 'walk_left':
                self.current_animation = 'idle_left'
            elif self.current_animation == 'walk_down':
                self.current_animation = 'idle_down'
            elif self.current_animation == 'walk_up':
                self.current_animation = 'idle_up'
        
    def use_ability(self, ability_name: str, enemies: List['Enemy']) -> None:
        ability = self.abilities[ability_name]
        if not ability.is_ready():
            return

         # Set attack animation based on current direction
        if 'idle_up' in self.current_animation:
            self.current_animation = 'atk_up'
        elif 'idle_down' in self.current_animation:
            self.current_animation = 'atk_down'
        elif 'idle_left' in self.current_animation:
            self.current_animation = 'atk_left'
        elif 'idle_right' in self.current_animation:
            self.current_animation = 'atk_right'
        elif 'walk_up' in self.current_animation:
            self.current_animation = 'atk_up'
        elif 'walk_down' in self.current_animation:
            self.current_animation = 'atk_down'
        elif 'walk_left' in self.current_animation:
            self.current_animation = 'atk_left'
        elif 'walk_right' in self.current_animation:
            self.current_animation = 'atk_right'
            
        self.frame_index = 0  # Reset frame index to start animation
        self.state = PlayerState.SLASHING  # Set to appropriate state based on ability
        self.attack_timer = 0

        effect = ability.use(self.x, self.y, self.direction)
        self.active_effects.append(effect)

        # if self.name == "aoe":
        #     # Circle of Damage
        #     for enemy in enemies:
        #         dist = sqrt((enemy.x - self.x)**2 + (enemy.y - self.y)**2)
        #         if dist <= self.range:
        #             enemy.take_damage(self.damage)
                    
        # elif self.name == "cone":
        #     # Forward Slash in 90-degree cone
        #     cone_angle = pi / 2  # 90 degrees in radians
        #     for enemy in enemies:
        #         dx = enemy.x - self.x
        #         dy = enemy.y - self.y
        #         dist = sqrt(dx * dx + dy * dy)
        #         if dist <= self.range:
        #             enemy_angle = atan2(dy, dx)
        #             angle_diff = abs(enemy_angle - self.direction)
        #             while angle_diff > pi:
        #                 angle_diff -= 2 * pi
        #             if abs(angle_diff) <= cone_angle / 2:
        #                 enemy.take_damage(self.damage)
        
        if ability_name == "projectile":
            if self.has_multi_shot:
                # Fire in four directions: N, S, E, W
                directions = [self.direction, self.direction + pi/2, self.direction + pi, self.direction + 3*pi/2]  # East, South, West, North
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
                
        # ability.use()

    def move(self, dx: int, dy: int, walls: List[pygame.Rect]):
        # Normalize diagonal movement by scaling the speed
        length = (dx * dx + dy * dy) ** 0.5  # Calculate vector length
        if length > 0:  # Avoid division by zero
            # Scale dx and dy so diagonal movement isn't faster
            dx = dx / length
            dy = dy / length
            
        # Calculate new position with diagonal movement
        new_x = self.x + dx * self.speed
        new_y = self.y + dy * self.speed
        player_rect = pygame.Rect(new_x - self.size/2, new_y - self.size/2, self.size, self.size)
        
        # Try diagonal movement first
        if not any(player_rect.colliderect(wall) for wall in walls):
            self.x = new_x
            self.y = new_y
        else:
            # If diagonal movement fails, try horizontal movement
            horizontal_rect = pygame.Rect(
                new_x - self.size/2, 
                self.y - self.size/2,  # Keep original y
                self.size, 
                self.size
            )
            if dx != 0 and not any(horizontal_rect.colliderect(wall) for wall in walls):
                self.x = new_x
                
            # Try vertical movement
            vertical_rect = pygame.Rect(
                self.x - self.size/2,  # Keep original x
                new_y - self.size/2, 
                self.size, 
                self.size
            )
            if dy != 0 and not any(vertical_rect.colliderect(wall) for wall in walls):
                self.y = new_y
                
        # Update animation based on movement
        self.set_animation_based_on_movement(dx, dy)
            
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

    def update_ability_effects(self, enemies: List['Enemy'], dt: float):
        # Update existing effects and check for new collisions
        current_time = time()
        
        for effect in self.active_effects[:]:
            if effect.is_expired():
                self.active_effects.remove(effect)
                continue
                
            for enemy in enemies:
                if enemy.is_dead():
                    continue
                    
                hit = False
                enemy_id = id(enemy)
                
                if effect.ability_name == "Circle of Damage":
                    # Circle AOE check
                    dist = sqrt((enemy.x - self.x)**2 + (enemy.y - self.y)**2)
                    if dist <= effect.range:
                        # Check if enough time has passed since last damage
                        last_damage_time = effect.hit_enemies.get(enemy_id, 0)
                        if current_time - last_damage_time >= 0.1:  # Apply damage every 0.1 seconds
                            enemy.take_damage(effect.damage)
                            effect.hit_enemies[enemy_id] = current_time
                            hit = True
                    
                elif effect.ability_name == "Forward Slash":
                    # Cone check (single hit damage - unchanged)
                    dist = sqrt((enemy.x - self.x)**2 + (enemy.y - self.y)**2)
                    if dist <= effect.range:
                        dx = enemy.x - self.x
                        dy = enemy.y - self.y
                        enemy_angle = atan2(dy, dx)
                        angle_diff = abs(enemy_angle - self.direction)
                        while angle_diff > pi:
                            angle_diff -= 2 * pi
                        if abs(angle_diff) <= pi/4 and enemy_id not in effect.hit_enemies:  # 45-degree cone
                            enemy.take_damage(effect.damage)
                            effect.hit_enemies[enemy_id] = current_time
                            hit = True
                            
                elif effect.ability_name == "Energy Bolt":
                    # Projectile collision (unchanged)
                    for projectile in self.projectiles:
                        proj_rect = pygame.Rect(projectile.x - 5, projectile.y - 5, 10, 10)
                        enemy_rect = pygame.Rect(enemy.x - enemy.size/2, 
                                            enemy.y - enemy.size/2,
                                            enemy.size, enemy.size)
                        if proj_rect.colliderect(enemy_rect):
                            hit = True
                            break

class PowerUpType(Enum):
    HEALTH = "health"
    DAMAGE = "damage"
    SPEED = "speed"  # replace with DASH
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

        # set color based on type (to be replaced w/ sprites)
        if power_up_type == PowerUpType.HEALTH:
            self.color = (255, 0, 255)  # Magenta for health
        elif power_up_type == PowerUpType.DAMAGE:
            self.color = (255, 0, 0)    # Red for damage
        elif power_up_type == PowerUpType.SPEED:
            self.color = (0, 255, 255)  # Cyan for speed
        elif power_up_type == PowerUpType.COOLDOWN:
            self.color = (255, 255, 0)  # Yellow for cooldown
        else:
            self.color = (255, 120, 0)
        
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
        self.size = 48 if is_boss else 32  # Changed to match tile size
        self.attack_cooldown = 1.0
        self.last_attack = 0
        self.is_boss = is_boss
        self.sprite_offset_x = 8
        self.sprite_offset_y = 8
        
        if not is_boss:
            # Animation properties
            self.spritesheet = pygame.image.load("sprites/characters/32x32/Char_006.png").convert_alpha()
            self.frame_width = 32
            self.frame_height = 32
            self.animations = self._load_animations()
            self.current_animation = 'walk_down'
            self.frame_index = 0
            self.animation_speed = 0.1
            self.animation_timer = 0
            self.direction = 0  # Current facing direction in radians
        
    def _load_animations(self):
        animations = {
            'walk_down': [],   # Row 0
            'walk_left': [],   # Row 1
            'walk_right': [],  # Row 2
            'walk_up': []      # Row 3
        }
        
        # Extract frames for each animation
        for col in range(4):  # Assuming 3 frames per animation
            # Row 0: Walking down
            animations['walk_down'].append(self._get_frame(col, 0))
            # Row 1: Walking left
            animations['walk_left'].append(self._get_frame(col, 1))
            # Row 2: Walking right
            animations['walk_right'].append(self._get_frame(col, 2))
            # Row 3: Walking up
            animations['walk_up'].append(self._get_frame(col, 3))
            
        return animations
    
    def _get_frame(self, col: int, row: int) -> pygame.Surface:
        rect = pygame.Rect(
            self.sprite_offset_x + col * 48,
            self.sprite_offset_y + row * 48,
            self.frame_width,
            self.frame_height
        )
        frame = pygame.Surface((self.frame_width, self.frame_height), pygame.SRCALPHA)
        frame.blit(self.spritesheet, (0, 0), rect)
        return pygame.transform.scale(frame, (self.size, self.size))
    
    def update_animation(self, dt: float):
        if self.is_boss:
            return
            
        self.animation_timer += dt
        if self.animation_timer >= self.animation_speed:
            self.animation_timer = 0
            self.frame_index = (self.frame_index + 1) % len(self.animations[self.current_animation])
    
    def get_current_frame(self):
        if self.is_boss:
            return None
            
        return self.animations[self.current_animation][self.frame_index]
    
    def set_animation_based_on_movement(self, dx: float, dy: float):
        if self.is_boss:
            return
            
        # Determine which animation to use based on movement direction
        if abs(dx) > abs(dy):
            # Moving more horizontally than vertically
            if dx > 0:
                self.current_animation = 'walk_right'
            else:
                self.current_animation = 'walk_left'
        else:
            # Moving more vertically than horizontally
            if dy > 0:
                self.current_animation = 'walk_down'
            else:
                self.current_animation = 'walk_up'
        
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
                if not self.is_boss:
                    self.set_animation_based_on_movement(dx, dy)
                
    def attack_player(self, player: Player) -> bool:
        if time() - self.last_attack >= self.attack_cooldown:
            distance = sqrt((player.x - self.x)**2 + (player.y - self.y)**2)
            if distance < self.size + player.size:
                player.health -= self.damage
                self.last_attack = time()
                return True
        return False
