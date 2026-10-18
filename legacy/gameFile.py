import pygame
import random
from typing import List, Tuple

class Player:
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y
        self.health = 100
        self.speed = 5
        self.damage = 10
        self.sprite = None  # Will store the pixel art sprite
        self.attacking = False
        
    def move(self, dx: int, dy: int, walls: List[pygame.Rect]):
        new_x = self.x + dx * self.speed
        new_y = self.y + dy * self.speed
        player_rect = pygame.Rect(new_x, new_y, 32, 32)  # Adjust size as needed
        
        # Check wall collisions
        if not any(player_rect.colliderect(wall) for wall in walls):
            self.x = new_x
            self.y = new_y

class Enemy:
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y
        self.health = 50
        self.speed = 3
        self.damage = 5
        self.sprite = None
        
    def move_toward_player(self, player: Player, walls: List[pygame.Rect]):
        # Simple A* or direct movement implementation here
        pass

class Room:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.walls: List[pygame.Rect] = []
        self.enemies: List[Enemy] = []
        self.generate_layout()
    
    def generate_layout(self):
        # Simple room generation with walls and obstacles
        # Add walls around the edges
        wall_thickness = 20
        self.walls = [
            pygame.Rect(0, 0, self.width, wall_thickness),  # Top
            pygame.Rect(0, self.height - wall_thickness, self.width, wall_thickness),  # Bottom
            pygame.Rect(0, 0, wall_thickness, self.height),  # Left
            pygame.Rect(self.width - wall_thickness, 0, wall_thickness, self.height)  # Right
        ]
        
        # Add random obstacles
        for _ in range(5):
            x = random.randint(wall_thickness, self.width - wall_thickness - 50)
            y = random.randint(wall_thickness, self.height - wall_thickness - 50)
            self.walls.append(pygame.Rect(x, y, 50, 50))

class Game:
    def __init__(self):
        pygame.init()
        self.width = 800
        self.height = 600
        self.screen = pygame.display.set_mode((self.width, self.height))
        self.clock = pygame.time.Clock()
        self.running = True
        
        self.player = Player(self.width // 2, self.height // 2)
        self.current_room = Room(self.width, self.height)
        
    def handle_input(self):
        keys = pygame.key.get_pressed()
        dx = keys[pygame.K_d] - keys[pygame.K_a]
        dy = keys[pygame.K_s] - keys[pygame.K_w]
        self.player.move(dx, dy, self.current_room.walls)
        
    def update(self):
        for enemy in self.current_room.enemies:
            enemy.move_toward_player(self.player, self.current_room.walls)
            
    def draw(self):
        self.screen.fill((0, 0, 0))  # Black background
        
        # Draw walls
        for wall in self.current_room.walls:
            pygame.draw.rect(self.screen, (128, 128, 128), wall)
            
        # Draw player
        pygame.draw.rect(self.screen, (255, 0, 0), 
                        pygame.Rect(self.player.x, self.player.y, 32, 32))
        
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
