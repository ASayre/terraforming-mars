// Game.ts-specific behavior for Ares

// TODO(kberg): milestones and awards.

import { CardName } from "../CardName";
import { ICard } from "../cards/ICard";
import { LogHelper } from "../components/LogHelper";
import { Game } from "../Game";
import { SelectCard } from "../inputs/SelectCard";
import { ISpace } from "../ISpace";
import { LogMessageData } from "../LogMessageData";
import { LogMessageDataType } from "../LogMessageDataType";
import { LogMessageType } from "../LogMessageType";
import { Player } from "../Player";
import { Resources } from "../Resources";
import { ResourceType } from "../ResourceType";
import { SpaceBonus } from "../SpaceBonus";
import { AresSpaceBonus } from "./AresSpaceBonus";
import { TileType } from "../TileType";
import { HazardConstraint } from "./HazardData";
import { ITile } from "../ITile";

export const OCEAN_UPGRADE_TILES = [TileType.OCEAN_CITY, TileType.OCEAN_FARM, TileType.OCEAN_SANCTUARY];
export const HAZARD_TILES = [TileType.DUST_STORM_MILD, TileType.DUST_STORM_SEVERE, TileType.EROSION_MILD, TileType.EROSION_SEVERE];

export class AresHandler {
    private constructor() {}

    public static isAresSpaceBonus(a: SpaceBonus | AresSpaceBonus): a is AresSpaceBonus {
        switch (a) {
            case AresSpaceBonus.ANIMAL:
            case AresSpaceBonus.MEGACREDITS:
            case AresSpaceBonus.MICROBE:
            case AresSpaceBonus.POWER:
                return true;
        }
        return false;
    }

    // |player| placed a tile next to |adjacentSpace|.
    public static handleAdjacentPlacement (game: Game, adjacentSpace: ISpace, player: Player) {
        if (adjacentSpace.adjacency !== undefined && adjacentSpace.adjacency.bonus.length > 0) {
          if (!adjacentSpace.player) {
            throw new Error(`A tile with an adjacency bonus must have an owner (${adjacentSpace.x}, ${adjacentSpace.y}, ${adjacentSpace.adjacency.bonus}`);
          }
    
          var addResourceToCard = function(game: Game, player: Player, resourceType: ResourceType, resourceAsText: string) {
            const availableCards = player.getResourceCards(resourceType);
            if (availableCards.length === 0) {
            } else if (availableCards.length === 1) {
              player.addResourceTo(availableCards[0]);
            } else if (availableCards.length > 1) {
              game.addInterrupt({
                player: player,
                playerInput:
                  new SelectCard(
                    "Select a card to add an " + resourceAsText,
                    "Add " + resourceAsText + "s",
                    availableCards,
                    (selected: ICard[]) => {
                      player.addResourceTo(selected[0]);
                      LogHelper.logAddResource(game, player, selected[0], 1);
                      return undefined;
                    })
              });
            }
          };
        
          adjacentSpace.adjacency.bonus.forEach(bonus => {
            if (AresHandler.isAresSpaceBonus(bonus)) {
              // TODO(kberg): group and sum. Right now cards only have one animal to place, so this isn't
              // a problem.
              switch(bonus) {
                case AresSpaceBonus.ANIMAL:
                  addResourceToCard(game, player, ResourceType.ANIMAL, "animal");
                  break;
    
                case AresSpaceBonus.MEGACREDITS:
                  player.megaCredits++;
                  break;
    
                case AresSpaceBonus.POWER:
                  player.energy++;
                  break;
    
                case AresSpaceBonus.MICROBE:
                  addResourceToCard(game, player, ResourceType.MICROBE, "microbe");
                  break;
              }
            } else {
              game.grantSpaceBonus(player, bonus);
            }
            game.log(
              LogMessageType.DEFAULT,
              "${0} gains 1 ${1} for placing next to ${2}",
              new LogMessageData(LogMessageDataType.PLAYER, player.id),
              new LogMessageData(LogMessageDataType.STRING, bonus.toString()),
              new LogMessageData(LogMessageDataType.STRING, tileTypeAsString(adjacentSpace.tile?.tileType)));
            });
    
            var ownerBonus = 1;
            if (adjacentSpace.player) {
              if (adjacentSpace.player.playedCards.find(card => card.name === CardName.MARKETING_EXPERTS)) {
                  ownerBonus = 2;
              };
              
              adjacentSpace.player.megaCredits += ownerBonus;
              game.log(
                LogMessageType.DEFAULT,
                "${0} gains ${1} M€ for a tile placed next to ${2}",
                new LogMessageData(LogMessageDataType.PLAYER, adjacentSpace.player.id),
                new LogMessageData(LogMessageDataType.STRING, ownerBonus.toString()),
                new LogMessageData(LogMessageDataType.STRING, adjacentSpace.tile?.tileType.toString() || ""),);
            }
        }
    }

    public static adjacencyCosts(game: Game, space: ISpace): number {
        return game.board
            .getAdjacentSpaces(space)
            .map((adjacentSpace) => adjacentSpace?.adjacency?.cost || 0)
            .reduce((prior, current) => prior + current, 0);
    }

    public static payAdjacencyAndHazardCosts(game: Game, player: Player, space: ISpace) {
        var cost = this.adjacencyCosts(game, space);

        if (space.tile?.hazard) {
            switch (space.tile.tileType) {
                case TileType.DUST_STORM_MILD:
                case TileType.EROSION_MILD:
                    cost += 8;
                    break;

                case TileType.DUST_STORM_SEVERE:
                case TileType.EROSION_SEVERE:
                    cost += 16;
                    break;
            }
        }

        if (cost > 0) {
            game.log(LogMessageType.DEFAULT,
                "${0} placing a tile here costs ${1} M€",
                new LogMessageData(LogMessageDataType.PLAYER, player.id),
                new LogMessageData(LogMessageDataType.STRING, cost.toString()));

            // TODO(kberg): ask to pay or abort.
            game.addSelectHowToPayInterrupt(player, cost, false, false, "Select how to pay additional placement costs.");
        }
    }

    private static countResources(player: Player, resourceType: ResourceType): number {
        let count = player.playedCards
            .map((c) => resourceType === c.resourceType ? c.resourceCount || 0 : 0)
            .reduce((prior, current) => prior + current, 0);

        if (resourceType === player.corporationCard?.resourceType) {
            count += player.corporationCard.resourceCount || 0;
        }
        return count;
    }

    // Returns a map of resources and resource types to track, and the current count
    // of each of these |player| has. Used with |rewardForPlacement|.
    //
    // This feature is part of Ecological Survey and Geological Survey.
    //
    public static beforeTilePlacement(player: Player): Map<Resources | ResourceType, number> {
      var map: Map<Resources | ResourceType, number> = new Map();
      if (player.playedCards.find((c) => c.name === CardName.ECOLOGICAL_SURVEY)) {
          map.set(Resources.PLANTS, player.getResource(Resources.PLANTS));
          map.set(ResourceType.ANIMAL, AresHandler.countResources(player, ResourceType.ANIMAL));
          map.set(ResourceType.MICROBE, AresHandler.countResources(player, ResourceType.MICROBE));
      }
      if (player.playedCards.find((c) => c.name === CardName.GEOLOGICAL_SURVEY)) {
          map.set(Resources.STEEL, player.getResource(Resources.STEEL));
          map.set(Resources.TITANIUM, player.getResource(Resources.TITANIUM));
          map.set(Resources.HEAT, player.getResource(Resources.HEAT));
      }
      return map;
    }

    // Used with Ecological  and Geological Survey
    public static afterTilePlacement(game: Game, player: Player, startingResources?: Map<Resources | ResourceType, number>): void {
        if (!startingResources) {
            return;
        }

        function giveBonus(start: number | undefined, current: number): boolean {
            return start !== undefined && current > start;
        }

        // Although this bit of code goes through all six resource types, the expected input map will only contain
        // the three (or six) resources it is tracking.
        // TODO(kberg): bonus placement logging is inconsistent.
        [Resources.PLANTS, Resources.STEEL, Resources.TITANIUM, Resources.HEAT].forEach((resource) => {
            if (giveBonus(startingResources.get(resource), player.getResource(resource))) {
                player.setResource(resource, 1);

                var cardName = resource === Resources.PLANTS ? CardName.ECOLOGICAL_SURVEY : CardName.GEOLOGICAL_SURVEY;
                game.log(
                    LogMessageType.DEFAULT,
                    "${0} gained a bonus ${1} because of ${2}",
                    new LogMessageData(LogMessageDataType.PLAYER, player.id),
                    new LogMessageData(LogMessageDataType.STRING, resource),
                    new LogMessageData(LogMessageDataType.CARD, cardName)
                );
            }
        });
        [ResourceType.MICROBE, ResourceType.ANIMAL].forEach((resourceType) => {
            if (giveBonus(startingResources.get(resourceType), AresHandler.countResources(player, resourceType))) {
                game.addSelectResourceCardInterrupt(
                    player,
                    1,
                    resourceType,
                    player.getResourceCards(resourceType)
                );
            }
        });
    }

    public static setupHazards(game: Game, playerCount: number) {
        // The number of dust storms depends on the player count.
        // I made up that the solo player has 3 dust storms. The rules
        // don't take solo into account, nor if you played with more than
        // five players.
        if (playerCount >= 5) {
            randomlyPlaceHazard(game, TileType.DUST_STORM_MILD, 1);
        } else if (playerCount === 4) {
            randomlyPlaceHazard(game, TileType.DUST_STORM_MILD, 1);
            randomlyPlaceHazard(game, TileType.DUST_STORM_MILD, -1);
        } else if (playerCount <= 3) {
            randomlyPlaceHazard(game, TileType.DUST_STORM_MILD, 1);
            randomlyPlaceHazard(game, TileType.DUST_STORM_MILD, 1);
            randomlyPlaceHazard(game, TileType.DUST_STORM_MILD, -1);
        }
    }

    public static onTemperatureChange(game: Game) {
        testConstraint(
            game.aresData!.hazardData.severeErosionTemperature,
            game.getTemperature(),
            () => { makeSevere(game, TileType.EROSION_MILD, TileType.EROSION_SEVERE); }
        );
    }

    public static onOceanPlaced(game: Game, player: Player, isWorldGov: boolean) {
        testToPlaceErosionTiles(game, player);
        testToRemoveDustStorms(game, player, isWorldGov);
    }

    public static onOxygenChange(game: Game) {
        testConstraint(game.aresData!.hazardData.severeDustStormOxygen, game.getOxygenLevel(), () => {
                makeSevere( game, TileType.DUST_STORM_MILD, TileType.DUST_STORM_SEVERE);
            }
        );
    }

    // Returns true if |newTile| can cover |boardTile|.
    public static canCover(boardTile: ITile, newTile: ITile): boolean {
        if (boardTile.hazard) {
            // TODO(kberg): Take desperate measures into account.
            return true;
        } else if (boardTile.tileType === TileType.OCEAN && OCEAN_UPGRADE_TILES.includes(newTile.tileType)) {
            return true;
        }
        return false;
    }

    public static grantBonusForRemovingHazard(game: Game, player: Player, initialTileType?: TileType) {
        var steps: number;
        switch (initialTileType) {
            case TileType.DUST_STORM_MILD:
            case TileType.EROSION_MILD:
                steps = 1;
                break;

            case TileType.DUST_STORM_SEVERE:
            case TileType.EROSION_SEVERE:
                steps = 2;
                break;
        
            default:
                return;
        }
        player.increaseTerraformRatingSteps(steps, game);
        game.log(LogMessageType.DEFAULT,
            "${0}'s TR increases ${1} step(s) for removing {2}",
            new LogMessageData(LogMessageDataType.PLAYER, player.id),
            new LogMessageData(LogMessageDataType.STRING, steps.toString()),
            new LogMessageData(LogMessageDataType.STRING, tileTypeAsString(initialTileType)));
    }


    public static putHazardAt(space: ISpace, tileType: TileType) {
        var cost;
        switch(tileType) {
            case TileType.DUST_STORM_MILD:
            case TileType.EROSION_MILD:
                cost = 1;
                break;

            case TileType.DUST_STORM_SEVERE:
            case TileType.EROSION_SEVERE:
                cost = 2;
                break;

            default:
                throw new Error(`Tile type ${tileType} is not a hazard.`);
        }

        space.player = undefined;
        space.adjacency = { bonus: [], cost: cost };
        space.tile = { tileType: tileType, hazard: true };
    }
}

function randomlyPlaceHazard(game: Game, tileType: TileType, direction: 1 | -1) {
    var card = game.dealer.dealCard();
    game.log(
        LogMessageType.DEFAULT,
        "Dealt and discarded ${0} (cost ${1}) to place a hazard",
        new LogMessageData(LogMessageDataType.CARD, card.name),
        new LogMessageData(LogMessageDataType.STRING, card.cost.toString())
    );

    var distance = card.cost - 1;
    distance = Math.max(distance, 0); // Some cards cost zero.
    var space = game.board.getAvailableSpaceByOffset(distance, direction);
    if (space === undefined) {
        throw new Error("Couldn't find space when card cost is " + card.cost);
    }
    AresHandler.putHazardAt(space, tileType);
    return space;
}

function makeSevere(game: Game, from: TileType, to: TileType) {
    game.board.spaces
        .filter((s) => s.tile?.tileType === from)
        .forEach((s) => {
            AresHandler.putHazardAt(s, to);
        });

    game.log(LogMessageType.DEFAULT,
        "${1} have upgraded to {2}",
        new LogMessageData(LogMessageDataType.STRING, tileTypeAsString(from)),
        new LogMessageData(LogMessageDataType.STRING, tileTypeAsString(to)));
}

function testConstraint(constraint: HazardConstraint, testValue: number, cb: () => void) {
    if (!constraint.available) {
        return;
    }
    if (testValue >= constraint.threshold) {
        cb();
        constraint.available = false;
    }
}

function testToRemoveDustStorms(game: Game, player: Player, isWorldGov: boolean) {
    testConstraint(
        game.aresData!.hazardData.removeDustStormsOceanCount,
        game.board.getOceansOnBoard(),
        () => {
            // TODO(kberg): Take DESPERATE_MEASURES into account.
            // This isn't as simple as using tile.player, because that field allows players to place over it.
            game.board.spaces.forEach((space) => {
                if (space.tile?.tileType === TileType.DUST_STORM_MILD) {
                    space.tile.tileType === undefined;
                    space.adjacency!.cost! -= -1;
                }
                if (space.tile?.tileType === TileType.DUST_STORM_SEVERE) {
                    space.tile.tileType === undefined;
                    space.adjacency!.cost! -= -2;
                }
            });

            if (!isWorldGov) {
                player.increaseTerraformRating(game);
                game.log(LogMessageType.DEFAULT,
                    "${0}'s TR increases 1 step for eliminating dust storms.",
                    new LogMessageData(LogMessageDataType.PLAYER, player.id));        
            }
        }
    );
}

function testToPlaceErosionTiles(game: Game, player: Player) {
    testConstraint(
        game.aresData!.hazardData.erosionOceanCount,
        game.board.getOceansOnBoard(),
        () => {
            let type = TileType.EROSION_MILD;
            if (game.aresData!.hazardData.severeErosionTemperature === undefined) {
                type = TileType.EROSION_SEVERE;
            }

            var space1 = randomlyPlaceHazard(game, type, 1);
            var space2 = randomlyPlaceHazard(game, type, -1);
            [space1, space2].forEach((space) => {
                LogHelper.logTilePlacement(game, player, space, type);
            });
        }
    );
}

// TODO(kberg): convert to a log message type
const tileTypeToStringMap: Map<TileType, string> = new Map([
    [TileType.GREENERY, "greenery"],
    [TileType.OCEAN, "ocean"],
    [TileType.CITY, "city"],

    [TileType.CAPITAL, CardName.CAPITAL],
    [TileType.COMMERCIAL_DISTRICT, CardName.COMMERCIAL_DISTRICT],
    [TileType.ECOLOGICAL_ZONE, CardName.ECOLOGICAL_ZONE],
    [TileType.INDUSTRIAL_CENTER, CardName.INDUSTRIAL_CENTER],
    [TileType.LAVA_FLOWS, CardName.LAVA_FLOWS],
    [TileType.MINING_AREA, CardName.MINING_AREA],
    [TileType.MINING_RIGHTS, CardName.MINING_RIGHTS],
    [TileType.MOHOLE_AREA, CardName.MOHOLE_AREA],
    [TileType.NATURAL_PRESERVE, CardName.NATURAL_PRESERVE],
    [TileType.NUCLEAR_ZONE, CardName.NUCLEAR_ZONE],
    [TileType.RESTRICTED_AREA, CardName.RESTRICTED_AREA],

    // DEIMOS_DOWN, "",
    // GREAT_DAM, "",
    // MAGNETIC_FIELD_GENERATORS, "",

    [TileType.BIOFERTILIZER_FACILITY, CardName.BIOFERTILIZER_FACILITY],
    [TileType.METALLIC_ASTEROID, CardName.METALLIC_ASTEROID],
    [TileType.SOLAR_FARM, CardName.SOLAR_FARM],
    [TileType.OCEAN_CITY, CardName.OCEAN_CITY],
    [TileType.OCEAN_FARM, CardName.OCEAN_FARM],
    [TileType.OCEAN_SANCTUARY, CardName.OCEAN_SANCTUARY],
    [TileType.DUST_STORM_MILD, "Mild Dust Storm"],
    [TileType.DUST_STORM_SEVERE, "Severe Dust Storm"],
    [TileType.EROSION_MILD, "Mild Erosion"],
    [TileType.EROSION_SEVERE, "Severe Erosion"],
    [TileType.MINING_STEEL_BONUS, "Mining (Steel)"],
    [TileType.MINING_TITANIUM_BONUS, "Mining (Titanium)"],
]);

function tileTypeAsString(tileType: TileType | undefined): string {
    if (tileType === undefined) { return "undefined" };
    return tileTypeToStringMap.get(tileType)|| "special";
}
