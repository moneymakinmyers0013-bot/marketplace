import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {CartSidebar} from './cart-sidebar';import {useCartStore,type CartItem} from '../store/cart-store';
import type {AccountCall} from '@/lib/marketplace/write-adapter';
const {trade,request}=vi.hoisted(()=>({trade:vi.fn(),request:vi.fn()}));
vi.mock('@/lib/marketplace/use-trade',()=>({useTrade:trade}));vi.mock('@/lib/marketplace/api-client',()=>({marketplaceRequest:request}));
const item:CartItem={orderId:'LOCAL:0x9:0x2:1',collection:'0xa',tokenId:'9007199254740993',price:'1000000000000000000',currency:'0x1',quantity:'1',tokenName:'Realm'};
let calls:AccountCall[],caught:unknown;
let state:{address?:string;busy:boolean;config:{chain:string;demo:boolean};state:{stage:string;message:string};execute:(prepare:(marketplace:string)=>Promise<AccountCall[]>)=>Promise<boolean>};
beforeEach(()=>{calls=[];caught=undefined;request.mockReset();useCartStore.setState({items:[item],isOpen:true,inlineErrors:{},lastActionError:null});state={address:'0x3',busy:false,config:{chain:'LOCAL',demo:false},state:{stage:'idle',message:''},execute:async prepare=>{try{calls=await prepare('0x9');return true;}catch(e){caught=e;return false;}}};trade.mockImplementation(()=>state);request.mockResolvedValue({canSubmit:true,reasons:[],total:item.price,currency:item.currency,approvalAmount:item.price,expiresAt:2000000000,rows:[{key:item.orderId,valid:true}]});});
it('submits exact approval and bounded atomic cart then clears only after acceptance',async()=>{render(<CartSidebar/>);fireEvent.click(await screen.findByText('Checkout'));await waitFor(()=>expect(useCartStore.getState().items).toHaveLength(0));expect(calls.map(c=>c.entrypoint)).toEqual(['approve','buy_many']);expect(calls[1].calldata).toEqual(['1','0x2','1','0x1',item.price,'0','2000000000']);});
it('retains cart and displays per-order preflight failures',async()=>{request.mockResolvedValue({canSubmit:false,reasons:[],rows:[{key:item.orderId,valid:false,message:'NFT transferred'}]});render(<CartSidebar/>);fireEvent.click(await screen.findByText('Checkout'));await waitFor(()=>expect(screen.getByText('NFT transferred')).toBeInTheDocument());expect(calls).toEqual([]);expect(useCartStore.getState().items).toHaveLength(1);});
it('rejects changed totals without asking the wallet to spend',async()=>{request.mockResolvedValue({canSubmit:true,reasons:[],total:'2000000000000000000',currency:'0x1',rows:[]});render(<CartSidebar/>);fireEvent.click(await screen.findByText('Checkout'));await waitFor(()=>expect(caught).toBeInstanceOf(Error));expect(calls).toEqual([]);expect(useCartStore.getState().items).toHaveLength(1);});
it('requires a connected wallet',async()=>{state.address=undefined;render(<CartSidebar/>);expect(await screen.findByText('Connect wallet to checkout')).toBeEnabled();});
it('cannot trade illustrative demo assets',async()=>{state.config.demo=true;render(<CartSidebar/>);expect(await screen.findByText('Demo — trading disabled')).toBeDisabled();});
it('prevents edits while a transaction is in progress',async()=>{state.busy=true;render(<CartSidebar/>);expect(await screen.findByLabelText('Remove Realm')).toBeDisabled();expect(screen.getByText('Processing…')).toBeDisabled();});
it('allows removing an unavailable item',async()=>{render(<CartSidebar/>);fireEvent.click(await screen.findByLabelText('Remove Realm'));expect(screen.getByText('Your cart is empty.')).toBeInTheDocument();});

vi.mock("@starknet-react/core",()=>({useConnect:()=>({connectAsync:vi.fn(),connectors:[],isPending:false})}));

it("keeps transaction preparation uninitialized while the drawer is closed", () => {
  useCartStore.setState({ isOpen: false });
  trade.mockClear();
  render(<CartSidebar />);
  expect(screen.getByRole("button", { name: "Cart (1)" })).toBeVisible();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trade).not.toHaveBeenCalled();
});
