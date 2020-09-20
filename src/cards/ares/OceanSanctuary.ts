import { AresSpaceBonus } from "../../ares/AresSpaceBonus";
import { CardName } from "../../CardName";
import { Game } from "../../Game";
import { SelectSpace } from "../../inputs/SelectSpace";
import { ISpace } from "../../ISpace";
import { Player } from "../../Player";
import { ResourceType } from "../../ResourceType";
import { TileType } from "../../TileType";
import { CardType } from "../CardType";
import { IResourceCard } from "../ICard";
import { IProjectCard } from "../IProjectCard";
import { Tags } from "../Tags";

// UNIMPLEMENTED
export class OceanSanctuary implements IProjectCard, IResourceCard {
  public cost: number = 9;
  public resourceType: ResourceType = ResourceType.ANIMAL;
  public resourceCount: number = 0;
  public tags: Array<Tags> = [Tags.ANIMAL];
  public cardType: CardType = CardType.ACTIVE;
  public name: CardName = CardName.OCEAN_SANCTUARY;
  
  public canPlay(player: Player, game: Game): boolean {
    return game.board.getOceansOnBoard() >= 5 - player.getRequirementsBonus(game);
  }

  public getVictoryPoints(): number {
    return Math.floor(this.resourceCount);
  }

    // TODO(kberg): deal with covering ocean spaces.
    public play(player: Player, game: Game) {
    return new SelectSpace(
      "Select space for Ocean Sanctuary",
      // TODO(kberg): Oceans with tiles on them can't be placed, either.
      game.board.getOceansTiles(),
        (space: ISpace) => {
          game.addTile(player, space.spaceType, space, {
            tileType: TileType.OCEAN_SANCTUARY
          });
          space.adjacency = {bonus: [AresSpaceBonus.ANIMAL]};
          return undefined;
        }
    );
  }
}
