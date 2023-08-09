module card_game::card_game {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::url::{Self, Url};
    use std::string::{Self, String};
    use sui::tx_context::{TxContext, Self};
    use std::option::{Self, Option, some};
    use sui::event;
    use std::vector;
    use sui::groth16;
    use std::hash;
    use sui::ecvrf;

    // CONSTANTS
    const STARTING_HEALTH: u64 = 100;

    // ENUMS
    const NO_WINNER: u64 = 0;
    const PLAYER_1_WINNER: u64 = 1;
    const PLAYER_2_WINNER: u64 = 2;

    // ERRORS
    const ESAME_PLAYER: u64 = 3;
    const EPLAYER_NOT_IN_GAME: u64 = 4;
    const EINDEX_OUT_OF_BOUNDS: u64 = 5;
    const EINVALID_PROOF: u64 = 6;
    
    struct Game has key, store{
        id: UID,
        player_1: Player,
        player_2: Player,
        winner: u64
    }

    struct Player has key, store{
        id: UID,
        addr: address,
        deck: vector<Card>,
        hand: vector<u8>,
        graveyard: vector<Card>,
        board: vector<Card>,
        life: u64,
    }

    struct Card has key, store{
        id: UID,
        name: String,
        description: String,
        // TODO: Add spells as type as well(potions/buffs/etc)
        type: Character,
        image_url: Url,
    }

    struct Character has store {
        life: u64,
        attack: u64,
    }

    struct Challenge has key {
        id: UID,
        challenger: address,
        opponent: address,
    }

    struct ChallengeAccepted has copy, drop {
        id: ID,
        challenger: address,
        accepter: address
    }

    struct TurnEnded has copy, drop{
        player: address,
    }

    struct GameOver has copy, drop {
        id: ID,
        winner: u64
    }

    struct VerifiedEvent has copy, drop {
        is_verified: bool,
    }

    public entry fun challenge_person(opponent: address, ctx: &mut TxContext) {
        assert!(opponent != tx_context::sender(ctx), ESAME_PLAYER);
        let challenge = Challenge{
            id: object::new(ctx),
            challenger: tx_context::sender(ctx),
            opponent: opponent,
        };
        transfer::transfer(challenge, opponent);
    }

    public entry fun accept_challenge(challenge: Challenge, ctx: &mut TxContext) {
        assert!(challenge.opponent == tx_context::sender(ctx), ESAME_PLAYER);
        event::emit(
            ChallengeAccepted{
                id: object::uid_to_inner(&challenge.id), 
                challenger: challenge.challenger,
                accepter: tx_context::sender(ctx),
        });

        let player_1 = Player{
            id: object::new(ctx),
            addr: challenge.challenger,
            deck: vector<Card>[], // get deck from player's owned objects (Cards) and shuffle
            hand: vector<u8>[],   // committment
            graveyard: vector<Card>[],
            board: vector<Card>[],
            life: STARTING_HEALTH,
        };
        let player_2 = Player{
            id: object::new(ctx),
            addr: challenge.opponent,
            deck: vector<Card>[],
            hand: vector<u8>[],
            graveyard: vector<Card>[],
            board: vector<Card>[],
            life: STARTING_HEALTH,
        };

        let game = Game{
            id: object::new(ctx),
            player_1: player_1,
            player_2: player_2,
            winner: NO_WINNER,
        };

        transfer::transfer(game, challenge.challenger);

        let Challenge {id, challenger: _, opponent: _ } = challenge;
        object::delete(id);
    }

    // use vrf to get random index
    // TODO: Figure out how to hide card in hand
    public entry fun draw(
        game: &mut Game, 
        output: vector<u8>, 
        alpha_string: vector<u8>, 
        public_key: vector<u8>, 
        proof: vector<u8>,
        ctx: &mut TxContext): &vector<Card>{
        assert!(verify_ecvrf_output(output, alpha_string, public_key, proof), EINVALID_PROOF);
        let (attacking_player, defending_player) = get_players(game, ctx);
        let size = vector::length<Card>(&attacking_player.deck);
        let random_index = vector::pop_back(&mut output) % (size as u8);
        let card_to_draw = vector::swap_remove<Card>(&mut attacking_player.deck, (random_index as u64));
        vector::push_back<Card>(&mut attacking_player.hand, card_to_draw);
        &attacking_player.hand
    }

    public fun discard(
        game: &mut Game, 
        index: u64,
        vk: vector<u8>, 
        public_inputs_bytes: vector<u8>, 
        proof_points_bytes: vector<u8>,
        ctx: &mut TxContext): &vector<Card>{
        assert!(verify_proof(vk, public_inputs_bytes, proof_points_bytes), EINVALID_PROOF);
        let (player, _) = get_players(game, ctx);
        assert!(index < vector::length<Card>(&player.hand), EINDEX_OUT_OF_BOUNDS);
        let card = vector::swap_remove<Card>(&mut player.hand, index);
        vector::push_back<Card>(&mut player.graveyard, card);
        &player.hand
    }

    public fun play_card(game: &mut Game, index: u64, ctx: &mut TxContext): &vector<Card> {
        let (player, _) = get_players(game, ctx);
        assert!(index < vector::length<Card>(&player.hand), EINDEX_OUT_OF_BOUNDS);
        // TODO: zk

        // move card from hand to board
        let card = vector::swap_remove<Card>(&mut player.hand, index);
        vector::push_back<Card>(&mut player.board, card);
        &player.board
    }

    public entry fun attack(
        game: Game, 
    attacking_character_index: u64, 
    defending_character_index: u64, 
    ctx: &mut TxContext){
        let game_over = false;
        let (attacking_player, defending_player) = get_players(&mut game, ctx);
        // choose a card from player_1's board to attack with
        let attacking_character = vector::borrow<Card>(&attacking_player.board, attacking_character_index);

        // choose a card from player_2's board to attack
        let defending_character = vector::borrow_mut<Card>(&mut defending_player.board, defending_character_index);

            // subtract health from player_2's card and health
        if(attacking_character.type.attack >= defending_character.type.life) {
            let difference = attacking_character.type.attack - defending_character.type.life;
            defending_character.type.life = 0;
            defending_player.life = defending_player.life - difference;
        } else {
            defending_character.type.life = defending_character.type.life - attacking_character.type.attack;
        };
        
        if(defending_player.life <= 0) {
            event::emit(
                GameOver{
                    id: object::uid_to_inner(&game.id), 
                    winner: PLAYER_1_WINNER
                });
            game_over = true;
        };
        
        // TODO: Delete game
        if(game_over) {
            let Game{
                id: game_id,
                player_1: player_1,
                player_2: player_2,
                winner: _,
            } = game;

            let Player{
                id: player_1_id,
                addr: _,
                deck: player_1_deck,
                hand: player_1_hand,
                graveyard: player_1_graveyard,
                board: player_1_board,
                life: _,
            } = player_1;

            // // Todo: find min length of decks and delete in order instead of deleting all one by one
            let i = 0;
            let size = vector::length<Card>(&mut player_1_deck);
            while(i < size){
                let card = vector::pop_back<Card>(&mut player_1_deck);
                let Card{
                    id: card_id,
                    name: _,
                    description: _,
                    type: Character{
                        attack: _,
                        life: _
                    },
                    image_url: _,
                } = card;
                object::delete(card_id);
                i = i + 1;
            };
            vector::destroy_empty<Card>(player_1_deck);

            i = 0;
            size = vector::length<Card>(&mut player_1_hand);
            while(i < size){
                let card = vector::pop_back<Card>(&mut player_1_hand);
                let Card{
                    id: card_id,
                    name: _,
                    description: _,
                    type: Character{
                        attack: _,
                        life: _
                    },
                    image_url: _,
                } = card;
                object::delete(card_id);
                i = i + 1;
            };
            vector::destroy_empty<Card>(player_1_hand);

            i = 0;
            size = vector::length<Card>(&mut player_1_graveyard);
            while(i < size){
                let card = vector::pop_back<Card>(&mut player_1_graveyard);
                let Card{
                    id: card_id,
                    name: _,
                    description: _,
                   type: Character{
                        attack: _,
                        life: _
                    },
                    image_url: _,
                } = card;
                object::delete(card_id);
                i = i + 1;
            };
            vector::destroy_empty<Card>(player_1_graveyard);

            i = 0;
            size = vector::length<Card>(&mut player_1_board);
            while(i < size){
                let card = vector::pop_back<Card>(&mut player_1_board);
                let Card{
                    id: card_id,
                    name: _,
                    description: _,
                    type: Character{
                        attack: _,
                        life: _
                    },
                    image_url: _,
                } = card;
                object::delete(card_id);
                i = i + 1;
            };
            vector::destroy_empty<Card>(player_1_board);


            //object::delete(attacking_player_id);

            
            object::delete(game_id);
        }
    }

    public entry fun end_turn(game: Game, pass_turn_to: address, ctx: &mut TxContext) {
        let (attacking_player, defending_player) = get_players(&mut game, ctx);
        assert!(pass_turn_to == defending_player.addr, ESAME_PLAYER);
        transfer::transfer(game, pass_turn_to);
        event::emit(TurnEnded{player: tx_context::sender(ctx)});
    }

    public fun verify_proof(vk: vector<u8>, public_inputs_bytes: vector<u8>, proof_points_bytes: vector<u8>): bool {
        let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &vk);
        let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
        let proof_points = groth16::proof_points_from_bytes(proof_points_bytes);
        let is_verified = groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points);
        event::emit(VerifiedEvent {is_verified: is_verified});
        is_verified
    }

    public fun verify_ecvrf_output(output: vector<u8>, alpha_string: vector<u8>, public_key: vector<u8>, proof: vector<u8>): bool {
        let is_verified = ecvrf::ecvrf_verify(&output, &alpha_string, &public_key, &proof);
        event::emit(VerifiedEvent {is_verified: is_verified});
        is_verified
    }
    
    ///////////////////////
    // PRIVATE FUNCTIONS //
    ///////////////////////

    // return players in order of attacking, defending
    fun get_players(game: &mut Game, ctx: &mut TxContext): (&mut Player, &mut Player) {
        if(game.player_1.addr == tx_context::sender(ctx)) {
            (&mut game.player_1, &mut game.player_2)
        } else {
            (&mut game.player_2, &mut game.player_1)
        }
    }
}