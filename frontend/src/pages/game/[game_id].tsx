import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Center,
  Container,
  Image,
  Button,
  ButtonGroup,
  Flex,
  Grid,
  GridItem,
  Tooltip,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { ethos, EthosConnectStatus, TransactionBlock } from "ethos-connect";
import {
  MODULE_ADDRESS,
  MAX_HAND_SIZE,
  STARTING_DECK_SIZE,
} from "../../../constants/index";
import {
  draw,
  discard,
  play,
  attack,
  Proof,
  surrender,
  end_turn,
} from "../../../calls/move_calls";
import State from "../../../components/State";

export default function GamePage() {
  const { wallet, provider } = ethos.useWallet();

  const [isWaitingForDiscard, setIsWaitingForDiscard] = useState(false);
  const [isWaitingForPlay, setIsWaitingForPlay] = useState(false);
  const [isWaitingForAttack, setIsWaitingForAttack] = useState(false);

  const [is_player_1, setIs_player_1] = useState(false);
  const [is_player_1_turn, setIs_player_1_turn] = useState(true); // todo: change later - should just be true on first render

  const [player_1, setPlayer_1] = useState<PlayerObject>();
  const [player_2, setPlayer_2] = useState<PlayerObject>();

  const [selected_cards_to_attack, setSelected_cards_to_attack] = useState<
    Card[] | null
  >(null);
  const [selected_cards_to_defend, setSelected_cards_to_defend] = useState<
    Card[] | null
  >(null);

  const router = useRouter();

  interface Card {
    id: string;
    name: string;
    description: string;
    attack: string;
    defense: string;
    image_url: string;
  }

  interface PlayerObject {
    address: string;
    board: Card[] | undefined;
    deck_commitment: string;
    deck_size: number;
    graveyard: Card[] | undefined;
    hand_commitment: string;
    hand_size: number;
    id: string;
    life: number;
    deck: Card[] | undefined;
    hand: Card[] | undefined;
  }

  interface PlayerBackend {
    address: string;
    hand: string[];
    deck: string[];
  }

  function new_player_object(
    address: string,
    board: Card[] | undefined,
    deck_commitment: string,
    deck_sizse: number,
    graveyard: Card[] | undefined,
    hand_commitment: string,
    hand_size: number,
    id: string,
    life: number,
    deck: Card[] | undefined,
    hand: Card[] | undefined
  ): PlayerObject {
    return {
      address: address,
      board: board,
      deck_commitment: deck_commitment,
      deck_size: deck_sizse,
      graveyard: graveyard,
      hand_commitment: hand_commitment,
      hand_size: hand_size,
      id: id,
      life: life,
      deck: deck,
      hand: hand,
    };
  }

  function get_player_backend(player: PlayerObject): PlayerBackend {
    return {
      address: player.address,
      hand: (player.hand || []).map((card: Card) => card.id),
      deck: (player.deck || []).map((card: Card) => card.id),
    };
  }

  function update_deck(
    deck: string[],
    player: PlayerObject
  ): Card[] | undefined {
    deck.forEach(async (id: string) => {
      if (id) {
        let card: any = (
          await provider?.getObject({
            id: id,
            options: { showContent: true },
          })
        )?.data?.content;
        if (
          player.deck?.length === 0 ||
          !player.deck?.find((card: Card) => card.id === id)
        ) {
          player.deck?.push({
            id: card.fields.id.id,
            name: card.fields.name,
            description: card.fields.description,
            attack: card.fields.type.fields.attack,
            defense: card.fields.type.fields.defense,
            image_url: card.fields.image_url,
          });
        }
      }
    });
    const deck_set = new Set(deck);
    player.deck = player.deck?.filter((card) => deck_set.has(card.id)) || [];
    return player.deck;
  }

  function update_hand(
    hand: string[],
    player: PlayerObject
  ): Card[] | undefined {
    // convert id to Card type
    // make sure we dont already have the card
    hand.forEach(async (id: string) => {
      if (id) {
        let card: any = (
          await provider?.getObject({
            id: id,
            options: { showContent: true },
          })
        )?.data?.content;
        if (
          player.hand?.length === 0 ||
          !player.hand?.find((card: Card) => card.id === id)
        ) {
          player.hand?.push({
            id: card.fields.id.id,
            name: card.fields.name,
            description: card.fields.description,
            attack: card.fields.type.fields.attack,
            defense: card.fields.type.fields.defense,
            image_url: card.fields.image_url,
          });
        }
      }
    });

    // delete card id's from hand that are not in the hand array
    const hand_set = new Set(hand);
    player.hand = player.hand?.filter((card) => hand_set.has(card.id)) || [];
    return player.hand;
  }

  async function handleCardClick(card: Card) {
    if (player_1 && player_2) {
      let player1 = get_player_backend(player_1);
      let player2 = get_player_backend(player_2);

      if (isWaitingForDiscard) {
        console.log("Discarding...");
        await discard_card(card, is_player_1 ? player1 : player2);
      } else if (isWaitingForPlay) {
        console.log("Playing...");
        await play_card(card, is_player_1 ? player1 : player2);
      } else if (isWaitingForAttack) {
        // if card belongs to player 1 -> attacking
        if (
          (player_1?.board?.includes(card) && is_player_1) ||
          (player_2?.board?.includes(card) && !is_player_1)
        ) {
          selected_cards_to_attack?.push(card);
        } else {
          selected_cards_to_defend?.push(card);
        }
      }
    }
  }

  async function draw_card(player: PlayerBackend) {
    let discard = await draw(
      wallet,
      router.query.game_id as string,
      is_player_1,
      player
    );
    if (discard) {
      setIsWaitingForDiscard(true);
    }
  }

  async function discard_card(card: Card, player: PlayerBackend) {
    await discard(
      wallet,
      router.query.game_id as string,
      card.id || "1",
      is_player_1,
      player
    );
    setIsWaitingForDiscard(false);
    setIsWaitingForPlay(true);
  }

  async function play_card(card: Card, player: PlayerBackend) {
    await play(
      wallet,
      router.query.game_id as string,
      card.id || "1",
      is_player_1,
      player
    );

    setIsWaitingForPlay(false);
    setIsWaitingForAttack(true);
    // console.log("Play_card: isWaitingForPlay = " + isWaitingForPlay);
    // console.log("Play_card: isWaitingForAttack = " + isWaitingForAttack);
  }

  useEffect(() => {
    let updating = true;
    update_board_state();
    turn_logic();
    return () => {
      updating = false;
    };

    // first render, it will be player 1 turn
    async function update_board_state() {
      console.log("Updating board state...");
      if (!updating) return;
      try {
        // get fields from backend
        const response = await fetch("http://localhost:5002/api/get", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const players = await response.json();
        // console.log("players from server: ", players);
        let p1_addr = players.player_1.address;
        let p2_addr = players.player_2.address;

        setIs_player_1(p1_addr === wallet?.address);
        // get rest of fields from contract

        // console.log("player_1 turn: " + is_player_1_turn);
        //console.log("player1? : " + is_player_1);

        // 1. fetch game struct
        let objects;
        let game_objects;
        let game;
        if (is_player_1_turn) {
          // get game struct from player 1
          objects = await provider?.getOwnedObjects({
            owner: p1_addr !== undefined ? p1_addr : "",
            options: {
              showType: true,
              showContent: true,
            },
          });
        } else {
          // get game struct from player 2
          objects = await provider?.getOwnedObjects({
            owner: p2_addr !== undefined ? p2_addr : "",
            options: {
              showType: true,
              showContent: true,
            },
          });
        }

        game_objects = objects?.data?.filter(
          (object) => object.data?.type === `${MODULE_ADDRESS}::card_game::Game`
        );
        game = game_objects?.find(
          (object) => object.data?.objectId === (router.query.game_id as string)
        );

        // console.log("game: " + JSON.stringify(game, null, 2));
        let p1_contract;
        let p2_contract;
        if (game) {
          if (
            game.data?.content &&
            "fields" in game.data?.content &&
            game.data?.content?.fields
          ) {
            p1_contract = game.data.content.fields.player_1.fields;
            // console.log(JSON.stringify(p1_contract, null, 2));
            p2_contract = game.data.content.fields.player_2.fields;
          }
        } else {
          console.log("game is undefined");
        }

        const defaultPlayer1 = new_player_object(
          p1_addr,
          p1_contract?.board,
          p1_contract?.deck_commitment,
          p1_contract?.deck_size,
          p1_contract?.graveyard,
          p1_contract?.hand_commitment,
          p1_contract?.hand_size,
          p1_contract?.id?.id,
          p1_contract?.life,
          [],
          []
        );

        const defaultPlayer2 = new_player_object(
          p2_addr,
          p2_contract?.board,
          p2_contract?.deck_commitment,
          p2_contract?.deck_size,
          p2_contract?.graveyard,
          p2_contract?.hand_commitment,
          p2_contract?.hand_size,
          p2_contract?.id?.id,
          p2_contract?.life,
          [],
          []
        );

        const currentPlayer1: PlayerObject = player_1 ?? defaultPlayer1;
        const currentPlayer2: PlayerObject = player_2 ?? defaultPlayer2;

        let p1_deck = update_deck(players.player_1.deck, currentPlayer1);
        let p1_hand = update_hand(players.player_1.hand, currentPlayer1);
        let p2_deck = update_deck(players.player_2.deck, currentPlayer2);
        let p2_hand = update_hand(players.player_2.hand, currentPlayer2);

        // fill in struct fields for each player
        if (p1_contract && p2_contract) {
          let player1 = new_player_object(
            p1_addr,
            p1_contract?.board,
            p1_contract?.deck_commitment,
            p1_contract?.deck_size,
            p1_contract?.graveyard,
            p1_contract?.hand_commitment,
            p1_contract?.hand_size,
            p1_contract?.id?.id,
            p1_contract?.life,
            p1_deck,
            p1_hand
          );

          let player2 = new_player_object(
            p2_addr,
            p2_contract?.board,
            p2_contract?.deck_commitment,
            p2_contract?.deck_size,
            p2_contract?.graveyard,
            p2_contract?.hand_commitment,
            p2_contract?.hand_size,
            p2_contract?.id?.id,
            p2_contract?.life,
            p2_deck,
            p2_hand
          );

          setPlayer_1(player1);
          setPlayer_2(player2);
          // console.log("p1 " + JSON.stringify(player1, null, 2));
          // console.log("p2 " + JSON.stringify(player2, null, 2));
          router.push(router.asPath);
          console.log("Finished updating board state...");
          // console.log(
          //   "player 1 board: ",
          //   JSON.stringify(player_1?.board, null, 2)
          // );
          console.log("After Update: isWaitingForPlay = " + isWaitingForPlay);
          console.log(
            "After Update: isWaitingForAttack = " + isWaitingForAttack
          );
        }
      } catch (err) {
        console.log(err);
      }
    }

    async function turn_logic() {
      try {
        if (is_player_1_turn) {
          if (is_player_1) {
            if (player_1) {
              let player1 = get_player_backend(player_1);
              if (
                !isWaitingForAttack &&
                !isWaitingForDiscard &&
                !isWaitingForPlay
              ) {
                await draw_card(player1);
              }
              // will rerender on each state transition -> need to check ifs on each cond
              else if (!isWaitingForDiscard && !isWaitingForAttack) {
                setIsWaitingForPlay(true);
              } else if (
                !isWaitingForAttack &&
                !isWaitingForPlay &&
                !isWaitingForDiscard
              ) {
                setIs_player_1_turn(false);
              }
            } else {
              console.log("player 1 is undefined");
            }
          }
        }

        // player 2's turn
        // else {
        //   if (!is_player_1) {
        //     if (player_1 && player_2) {
        //       let player1 = get_player_backend(player_1);
        //       let player2 = get_player_backend(player_2);
        //       await draw(
        //         wallet,
        //         router.query.game_id as string,
        //         is_player_1,
        //         player1,
        //         player2
        //       );
        //     }
        //     if (
        //       player_2 &&
        //       player_2.hand &&
        //       player_2.hand.length > MAX_HAND_SIZE
        //     ) {
        //       setIsWaitingForDiscard(true);
        //     }
        //     if (!isWaitingForDiscard) {
        //       setIsWaitingForPlay(true);
        //     }
        //     if (!isWaitingForPlay) {
        //       setIsWaitingForAttack(true);
        //     }
        //     if (!isWaitingForAttack) {
        //       setIs_player_1_turn(true);
        //     }
        //   }
        // }
      } catch (error) {
        console.log(error);
      }
    }
  }, [
    isWaitingForAttack,
    isWaitingForDiscard,
    isWaitingForPlay,
    is_player_1_turn,
  ]);

  return (
    <>
      {is_player_1 ? (
        <>
          {/* Logic for player 1*/}
          <div
            className={
              "min-h-screen flex flex-col items-center laptop:bg-[url('/images/map.png')]"
            }
          >
            {/* Main Div */}
            <div className="grid grid-rows-7 min-h-screen w-4/5 gap-2">
              {/* FIRST DIV */}
              <div className="grid grid-cols-8 w-full min-h-ful gap-2 p-2 ">
                <div className="w-full h-full p-2  ">
                  {player_2 && player_2.hand && player_2.hand.length > 0 ? (
                    <Image
                      src="/images/cards/back.jpeg"
                      alt="card"
                      style={{ width: "100px", height: "auto" }}
                    />
                  ) : (
                    <Image></Image>
                  )}
                </div>
                <div className="w-full h-full p-2 "></div>
                <div className="w-full h-full p-2 "></div>
                <div className="w-full h-full p-2 ">
                  <Tooltip
                    placement="bottom"
                    label={`Health: ${player_2?.life || "Loading..."}`}
                  >
                    <Image src="/images/player2.png" alt="player-2" />
                  </Tooltip>
                </div>
                <div className="w-full h-full p-2 "></div>
                <div className="w-full h-full p-2 "></div>
                <div className="w-full h-full p-2 "></div>
                <div className="w-full h-full p-2 "></div>
              </div>
              <div className="grid grid-cols-8 w-full min-h-full gap-2 p-2 ">
                <div className="w-full h-full p-2 "></div>
                {player_2?.hand?.map((card: Card, index: number) => (
                  <div key={index} className="w-full h-full p-2 ">
                    <Image
                      src="/images/cards/back.jpeg"
                      alt="card"
                      style={{ width: "100px", height: "auto" }}
                    />
                  </div>
                ))}
                <div className="w-full h-full p-2 "></div>
              </div>

              {/* Second Div */}
              <div className="h-full  grid grid-rows-7 items-center row-span-3 gap-2 ">
                <div className="grid row-span-2 grid-cols-8 w-full min-h-full gap-2 p-2">
                  {player_2?.board?.map((card: Card, index: number) => (
                    <div key={index} className="w-full h-full p-2">
                      <Tooltip
                        placement="bottom"
                        label={`Card Name: ${card.name}\nCard Description: ${card.description}\nAttack: ${card.attack}\nDefense: ${card.defense}`}
                      >
                        <Button
                          onClick={() => handleCardClick(card)} // Replace with your onClick handler function
                          className="w-full h-full p-0 hover:border-red-500"
                          style={{
                            border: isWaitingForAttack
                              ? "2px solid red"
                              : "none",
                            background: "none",
                            cursor: "pointer",
                          }}
                        >
                          <Image src="/images/cards/front.png" alt="shark" />
                        </Button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 min-h-full bg-orange-400 w-full items-center">
                  <div className="flex justify-center ">
                    <Button
                      colorScheme="yellow"
                      isDisabled={false ? is_player_1_turn : true}
                      onClick={() =>
                        end_turn(wallet, router.query.game_id as string)
                      }
                    >
                      End Turn
                    </Button>
                  </div>
                  <div className="flex justify-center">
                    <State
                      isWaitingForDiscard={isWaitingForDiscard}
                      isWaitingForAttack={isWaitingForAttack}
                      isWaitingForPlay={isWaitingForPlay}
                      wallet={wallet}
                      router={router}
                      selected_cards_to_attack={selected_cards_to_attack}
                      selected_cards_to_defend={selected_cards_to_defend}
                    />
                  </div>
                  <div className="flex justify-center ">
                    <Button
                      colorScheme="red"
                      onClick={() => {
                        surrender(wallet, router.query.game_id as string);
                        router.push("/");
                      }}
                    >
                      Surrender
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-8 w-full min-h-full row-span-2 p-2 gap-2 ">
                  <div className="w-full h-full p-2 "></div>
                  {player_1?.board?.map((card: Card, index: number) => (
                    <div key={index} className="w-full h-full p-2">
                      <Tooltip
                        placement="bottom"
                        label={`Card Name: ${card.name}\nCard Description: ${card.description}\nAttack: ${card.attack}\nDefense: ${card.defense}`}
                      >
                        <Button
                          onClick={() => handleCardClick(card)} // Replace with your onClick handler function
                          className="w-full h-full p-0 hover:border-red-500"
                          style={{
                            border: isWaitingForAttack
                              ? "2px solid red"
                              : "none",
                            background: "none",
                            cursor: "pointer",
                          }}
                        >
                          <Image src="/images/cards/front.png" alt="shark" />
                        </Button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-8 w-full min-h-full p-2 gap-2 ">
                <div></div>
                {player_1?.hand?.map((card: Card, index: number) => (
                  <div key={index} className="w-full h-full p-2">
                    <Tooltip
                      placement="bottom"
                      label={`${card.name} \n
                        ${card.description} \n
                        A:${card.attack} D:${card.defense}`}
                    >
                      <Button
                        onClick={() => handleCardClick(card)} // Replace with your onClick handler function
                        className="w-full h-full p-0"
                        style={{
                          height: "80px",
                          width: "80px",
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                        }}
                        disabled={isWaitingForAttack}
                      >
                        <Box
                          _hover={{ backgroundColor: "#ebedf0" }} // Hover effect for the Box
                        >
                          <Image src="/images/cards/front.png" alt="shark" />
                        </Box>
                      </Button>
                    </Tooltip>
                  </div>
                ))}
              </div>
              <div className="grid row-span-2 grid-cols-8 w-full min-h-fullgap-2 p-2">
                <div className="w-full h-full p-2  ">
                  {player_1 &&
                  player_1.graveyard &&
                  player_1.graveyard.length > 0 ? (
                    <Image
                      src="/images/cards/front.png"
                      alt="card"
                      style={{
                        width: "100px",
                        height: "auto",
                        marginTop: "50px",
                      }}
                    />
                  ) : (
                    <Image></Image>
                  )}
                </div>
                <div className="w-full h-full p-2  "></div>
                <div className="w-full h-full p-2  "></div>
                <div className="w-full h-full p-2 mt-20 mb-5">
                  <Tooltip
                    placement="top"
                    label={`Health: ${player_1?.life || "Loading..."}`}
                  >
                    <Image src="/images/player1.png" alt="player-1" />
                  </Tooltip>
                </div>
                <div className="w-full h-full p-2 "></div>
                <div className="w-full h-full p-2"></div>
                <div className="w-full h-full p-2"></div>
                <div className="w-full h-full p-2">
                  {player_1 && player_1.deck && player_1.deck.length > 0 ? (
                    <Image
                      src="/images/cards/back.jpeg"
                      alt="card"
                      style={{
                        width: "100px",
                        height: "auto",
                        marginTop: "50px",
                      }}
                    />
                  ) : (
                    <Image></Image>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Logic for player 2's turn */}
          <div
            className={
              "min-h-screen flex flex-col items-center bg-[url('/images/lobby.png')]"
            }
          >
            {/* Main Div */}
            <div className="grid grid-rows-7 min-h-screen w-4/5 gap-2">
              {/* FIRST DIV */}
              <div className="grid grid-cols-8 w-full min-h-full bg-blue-500 gap-2 p-2 ">
                <div className="w-full h-full p-2 bg-green-800 ">
                  {player_1 && player_1.hand && player_1.hand.length > 0 ? (
                    <Image src="/images/cards/back.jpeg" alt="enemy-deck" />
                  ) : (
                    <Image></Image>
                  )}
                </div>
                <div className="w-full h-full p-2 bg-blue-800 "></div>
                <div className="w-full h-full p-2 bg-blue-800 "></div>
                <div className="w-full h-full p-2 bg-blue-800 ">
                  <Tooltip
                    placement="bottom"
                    label={`Health: ${player_1?.life || "Loading..."}`}
                  >
                    <Image src="/images/player1.png" alt="player-1" />
                  </Tooltip>
                </div>
                <div className="w-full h-full p-2 bg-blue-800 "></div>
                <div className="w-full h-full p-2 bg-blue-800 "></div>
                <div className="w-full h-full p-2 bg-blue-800 "></div>
                <div className="w-full h-full p-2 bg-blue-800 "></div>
              </div>
              <div className="grid grid-cols-8 w-full min-h-full bg-blue-500 gap-2 p-2 ">
                <div className="w-full h-full p-2 bg-blue-800 "></div>
                {player_1?.hand?.map((card: Card, index: number) => (
                  <div key={index} className="w-full h-full p-2 bg-blue-800">
                    <Image src="/images/cards/back.jpeg" alt="card" />
                  </div>
                ))}
                <div className="w-full h-full p-2 bg-blue-800 "></div>
              </div>
              {/* Second Div */}
              <div className="h-full  grid grid-rows-7 items-center row-span-3 gap-2 ">
                <div className="grid row-span-2 grid-cols-8 w-full min-h-full bg-blue-500 gap-2 p-2">
                  {player_1?.board?.map((card: Card, index: number) => (
                    <div key={index} className="w-full h-full p-2 bg-blue-800">
                      <Tooltip
                        placement="bottom"
                        label={`Card Name: ${card.name}\nCard Description: ${card.description}\nAttack: ${card.attack}\nDefense: ${card.defense}`}
                      >
                        <Button
                          onClick={() => handleCardClick(card)} // Replace with your onClick handler function
                          className="w-full h-full p-0 hover:border-red-500"
                          style={{
                            border: isWaitingForAttack
                              ? "2px solid red"
                              : "none",
                            background: "none",
                            cursor: "pointer",
                          }}
                        >
                          <Image src="/images/cards/front.png" alt="shark" />
                        </Button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 min-h-full bg-orange-400 w-full items-center">
                  <div className="flex justify-center ">
                    <Button
                      colorScheme="yellow"
                      isDisabled={false ? is_player_1_turn : false}
                      onClick={() =>
                        end_turn(wallet, router.query.game_id as string)
                      }
                    >
                      End Turn
                    </Button>
                  </div>
                  <div className="flex justify-center">
                    <State
                      isWaitingForDiscard={isWaitingForDiscard}
                      isWaitingForAttack={isWaitingForAttack}
                      isWaitingForPlay={isWaitingForPlay}
                      wallet={wallet}
                      router={router}
                      selected_cards_to_attack={selected_cards_to_attack}
                      selected_cards_to_defend={selected_cards_to_defend}
                    />
                  </div>
                  <div className="flex justify-center ">
                    <Button
                      colorScheme="red"
                      onClick={() => {
                        surrender(wallet, router.query.game_id as string);
                        router.push("/");
                      }}
                    >
                      Surrender
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-8 w-full min-h-full bg-green-500 row-span-2 p-2 gap-2 ">
                  {player_2?.board?.map((card: Card, index: number) => (
                    <div key={index} className="w-full h-full p-2 bg-green-800">
                      <Tooltip
                        placement="bottom"
                        label={`Card Name: ${card.name}\nCard Description: ${card.description}\nAttack: ${card.attack}\nDefense: ${card.defense}`}
                      >
                        <Button
                          onClick={() => handleCardClick(card)} // Replace with your onClick handler function
                          className="w-full h-full p-0 hover:border-red-500"
                          style={{
                            border: isWaitingForAttack
                              ? "2px solid red"
                              : "none",
                            background: "none",
                            cursor: "pointer",
                          }}
                        >
                          <Image src="/images/cards/front.png" alt="shark" />
                        </Button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-8 w-full min-h-full bg-green-500 p-2 gap-2 ">
                {player_2?.hand?.map((card: Card, index: number) => (
                  <div key={index} className="w-full h-full p-2 bg-green-800">
                    <Tooltip
                      placement="bottom"
                      label={`Card Name: ${card.name}\nCard Description: ${card.description}\nAttack: ${card.attack}\nDefense: ${card.defense}`}
                    >
                      <Button
                        onClick={() => handleCardClick(card)} // Replace with your onClick handler function
                        className="w-full h-full p-0 hover:border-red-500"
                        style={{
                          border: isWaitingForAttack ? "2px solid red" : "none",
                          background: "none",
                          cursor: "pointer",
                        }}
                      >
                        <Image src="/images/cards/front.png" alt="shark" />
                      </Button>
                    </Tooltip>
                  </div>
                ))}
              </div>
              <div className="grid row-span-2 grid-cols-8 w-full min-h-full bg-green-500 gap-2 p-2">
                <div className="w-full h-full p-2 bg-green-800 "></div>
                <div className="w-full h-full p-2 bg-green-800 "></div>
                <div className="w-full h-full p-2 bg-green-800 "></div>
                <div className="w-full h-full p-2 bg-green-800 ">
                  <Tooltip
                    placement="top"
                    label={`Health: ${player_2?.life || "Loading..."}`}
                  >
                    <Image src="/images/player2.png" alt="player-2" />
                  </Tooltip>
                </div>
                <div className="w-full h-full p-2 bg-green-800 "></div>
                <div className="w-full h-full p-2 bg-green-800 "></div>
                <div className="w-full h-full p-2 bg-green-800 "></div>
                <div className="w-full h-full p-2 bg-green-800 "></div>
              </div>
            </div>
          </div>
        </>
      )}
      ;
    </>
  );
}
