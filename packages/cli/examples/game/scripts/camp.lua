-- Dialogues of the camp guard. Only the lines meant for players are translated:
-- identifiers, paths and debug messages are left as they are.
local Guard = {}
Guard.state = "idle"
Guard.portrait = "media/ui/portraits/guard.png"

function Guard.greet(player)
  print("[debug] greet id=" .. player:getID())
  player:Say("*yawns* Another one. Welcome to the camp.")
  player:Say(string.format("You look tired, %s.\nGet some rest by the fire.", player:getName()))
end

function Guard.warn(player)
  player:Say("Don't go back to town before nightfall.")
end

return Guard
